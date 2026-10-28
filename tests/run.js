const fs = require("fs");
const vm = require("vm");
const { JSDOM } = require("jsdom");
const path = require("path");
const EXT = path.join(__dirname, "..") + path.sep;

// ---- fake chrome storage shared by background + content ----
const store = {};
const changeListeners = [];
const storage = {
  local: {
    get(def, cb) {
      let out;
      if (def === null) out = { ...store };
      else { out = {}; for (const [k, v] of Object.entries(def)) out[k] = k in store ? store[k] : v; }
      const p = Promise.resolve(JSON.parse(JSON.stringify(out)));
      if (cb) p.then(cb); return p;
    },
    set(obj, cb) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) { changes[k] = { oldValue: store[k], newValue: v }; store[k] = JSON.parse(JSON.stringify(v)); }
      changeListeners.forEach((l) => l(changes, "local"));
      const p = Promise.resolve(); if (cb) p.then(cb); return p;
    }
  },
  onChanged: { addListener: (f) => changeListeners.push(f) }
};
let msgListener;
let fetchCalls = 0;
const mode = { fail: false };

// Mock Groq: show anything whose title mentions ads/business/n8n/clients
async function fakeFetch(url, opts) {
  fetchCalls++;
  if (mode.fail) return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({ error: { message: "boom" } }) };
  const body = JSON.parse(opts.body);
  if (body.model !== "openai/gpt-oss-20b") throw new Error("wrong model " + body.model);
  if (body.reasoning_effort) return { ok: false, status: 400, headers: { get: () => null }, json: async () => ({ error: { message: "property 'reasoning_effort' is unsupported" } }) };
  if (!opts.headers.Authorization.includes("gsk_test")) throw new Error("bad auth header");
  const items = JSON.parse(body.messages[1].content);
  const results = items.map((it) => ({ id: it.id, show: /ads|business|n8n|client|cpl/i.test(it.title), why: "test reason" }));
  const H = { "x-ratelimit-limit-requests": "1000", "x-ratelimit-remaining-requests": String(1000 - fetchCalls), "x-ratelimit-reset-requests": "1m26.4s", "x-ratelimit-limit-tokens": "8000", "x-ratelimit-remaining-tokens": "7200" };
  return { ok: true, status: 200, headers: { get: (n) => H[n] ?? null }, json: async () => ({ usage: { total_tokens: 700 }, choices: [{ message: { content: JSON.stringify({ results }) } }] }) };
}

const bgCtx = {
  chrome: {
    storage,
    runtime: { id: "ext", getURL: (p) => "chrome-extension://ext/" + p, onInstalled: { addListener() {} }, onMessage: { addListener: (f) => (msgListener = f) }, openOptionsPage() {} }
  },
  fetch: fakeFetch, setTimeout, clearTimeout, AbortController, console, Date, JSON, Promise,
  importScripts: (f) => vm.runInContext(fs.readFileSync(EXT + f, "utf8"), bgCtx)
};
bgCtx.self = bgCtx;
vm.createContext(bgCtx);
vm.runInContext(fs.readFileSync(EXT + "background.js", "utf8"), bgCtx);

function post(id, sub, title) {
  return `<article><shreddit-post id="${id}" subreddit-prefixed-name="${sub}" post-title="${title}"><a slot="title">${title}</a></shreddit-post></article><hr>`;
}

const dom = new JSDOM(`<html><body><shreddit-feed id="feed">
${post("t3_a", "r/bodybuilding", "Leg day progress")}
${post("t3_b", "r/PPC", "anything")}
${post("t3_c", "r/oneplus", "My 15R came with 16GB ram")}
${post("t3_d", "r/digitalnomad2", "How I got my first agency client")}
<article><shreddit-ad-post id="ad1"></shreddit-ad-post></article><hr>
</shreddit-feed></body></html>`, { url: "https://www.reddit.com/", runScripts: "outside-only" });

const w = dom.window;
w.chrome = {
  storage,
  runtime: {
    lastError: null,
    sendMessage: (msg, cb) => { msgListener(JSON.parse(JSON.stringify(msg)), { id: "ext", tab: { id: 1 }, url: "https://www.reddit.com/" }, (res) => setTimeout(() => cb(res), 0)); }
  }
};
store.enabled = true; store.mode = "collapse"; store.apiKey = "gsk_test"; store.model = "llama-3.3-70b-versatile";
w.eval(fs.readFileSync(EXT + "content.js", "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d = w.document;
const state = (id) => d.getElementById(id).getAttribute("data-rf") + (d.getElementById(id).closest("article").classList.contains("rf-hidden") ? "/hidden" : "/visible");
let fails = 0;
const expect = (name, got, want) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${got}${ok ? "" : " (want " + want + ")"}`); };

(async () => {
  await sleep(9000);
  expect("bodybuilding hidden", state("t3_a"), "hide/hidden");
  expect("r/PPC shown (built-in sub)", state("t3_b"), "show/visible");
  expect("phone post hidden", state("t3_c"), "hide/hidden");
  expect("agency client post shown by AI", state("t3_d"), "show/visible");
  expect("ad hidden", d.getElementById("ad1").closest("article").classList.contains("rf-hidden"), true);
  expect("collapse bars", d.querySelectorAll(".rf-bar").length, 2);
  expect("bar text", d.querySelector(".rf-bar .rf-label").textContent, "Hidden · r/bodybuilding · test reason");

  // infinite scroll: new posts appended
  d.getElementById("feed").insertAdjacentHTML("beforeend", post("t3_e", "r/memes", "funny cat") + post("t3_f", "r/automation", "my n8n setup"));
  await sleep(9000);
  expect("scrolled meme hidden", state("t3_e"), "hide/hidden");
  expect("automation shown", state("t3_f"), "show/visible");

  // Show button reveals
  d.querySelector(".rf-bar .rf-btn").click();
  expect("show button reveals", state("t3_a"), "show/visible");

  // Always show button updates storage
  const before = d.querySelectorAll(".rf-bar").length;
  [...d.querySelectorAll(".rf-btn-quiet")].find((b) => b.textContent.includes("oneplus")).click();
  await sleep(9000);
  expect("alwaysShow saved", store.alwaysShow, "oneplus");
  expect("oneplus now shown after rescan", state("t3_c"), "show/visible");

  // Cache: rescan should not call the API again for known posts
  const calls = fetchCalls;
  storage.local.set({ mode: "hide" });
  await sleep(9000);
  expect("no new API calls (cached)", fetchCalls, calls);
  expect("hide mode has no bars", d.querySelectorAll(".rf-bar").length, 0);
  expect("meme still hidden in hide mode", state("t3_e"), "hide/hidden");

  // Disable -> everything visible
  storage.local.set({ enabled: false });
  await sleep(500);
  expect("disabled shows all", d.querySelectorAll(".rf-hidden").length, 0);
  storage.local.set({ enabled: true });
  await sleep(9000);

  // API failure -> fall back to keywords, never crash
  mode.fail = true;
  d.getElementById("feed").insertAdjacentHTML("beforeend", post("t3_g", "r/random", "Best way to price my freelance services") + post("t3_h", "r/random", "Look at my dog"));
  await sleep(9000);
  expect("fallback keyword shows pricing post", state("t3_g"), "show/visible");
  expect("fallback hides dog", state("t3_h"), "hide/hidden");

  // Non-feed page is untouched
  w.history.pushState({}, "", "/r/bodybuilding/");
  d.getElementById("feed").insertAdjacentHTML("beforeend", post("t3_i", "r/bodybuilding", "squat form"));
  await sleep(1500);
  expect("subreddit page not filtered", d.getElementById("t3_i").getAttribute("data-rf"), null);

  // ---- quota tracking ----
  expect("quota has request limit", store.quota && store.quota.reqLimit, 1000);
  expect("quota counts tokens", store.quota.tokensToday > 0, true);
  expect("quota reset text", store.quota.reqReset, "1m26.4s");

  // ---- security checks ----
  const ask = (msg, sender) => new Promise((res) => { const r = msgListener(msg, sender, res); if (!r) setTimeout(() => res("rejected"), 50); });
  const page = { id: "ext", tab: { id: 1 }, url: "https://www.reddit.com/" };
  expect("foreign extension rejected", await ask({ type: "classify", posts: [] }, { id: "evil" }), "rejected");
  expect("content script cannot test keys", await ask({ type: "test", apiKey: "gsk_" + "a".repeat(30) }, page), "rejected");
  const own = { id: "ext", tab: { id: 9 }, url: "chrome-extension://ext/options.html" };
  const t = await ask({ type: "test", apiKey: "gsk_" + "a".repeat(30), model: "openai/gpt-oss-20b" }, own);
  expect("settings page in a tab can test a key", t !== "rejected", true);
  expect("malformed key refused", (await ask({ type: "test", apiKey: "sk-123" }, own)).ok, false);
  const r = await ask({ type: "classify", posts: [{ id: "__proto__", sub: "r/x", title: "t" }, { id: "t3_z", sub: "r/__proto__!", title: "t" }, { id: "t3_ok", sub: "r/PPC", title: "x".repeat(5000) }] }, page);
  expect("bad ids/subs dropped", Object.keys(r.results).join(","), "t3_ok");
  expect("prototype untouched", ({}).v, undefined);
  expect("content script cannot check quota", await ask({ type: "checkQuota" }, page), "rejected");
  expect("bad sub refused for alwaysShow", await ask({ type: "alwaysShow", sub: "r/<img src=x>" }, page), "rejected");

  console.log("stats", JSON.stringify(store.stats), "subStats", JSON.stringify(store.subStats));
  console.log(fails ? `${fails} FAILED` : "ALL PASSED");
  process.exit(fails ? 1 : 0);
})();
