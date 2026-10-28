const $ = (id) => document.getElementById(id);
const FIELDS = ["apiKey", "interests", "mode", "alwaysShow", "alwaysHide", "model"];
const DEFAULTS = {
  apiKey: "",
  interests: RF.DEFAULT_INTERESTS,
  mode: "collapse",
  alwaysShow: "",
  alwaysHide: "",
  model: "openai/gpt-oss-20b"
};
const MODELS = ["openai/gpt-oss-20b", "openai/gpt-oss-120b"];

let saved = {};

chrome.storage.local.get(DEFAULTS, (s) => {
  if (!MODELS.includes(s.model)) {
    s.model = DEFAULTS.model; // Groq retired the Llama models from v1.0
    chrome.storage.local.set({ model: s.model });
  }
  saved = s;
  for (const f of FIELDS) $(f).value = s[f];
});

function flash(el, text, ok) {
  el.textContent = text;
  el.className = "msg " + (ok ? "ok" : "bad");
}

$("save").addEventListener("click", async () => {
  const next = {};
  for (const f of FIELDS) next[f] = $(f).value;
  next.apiKey = next.apiKey.trim();
  if (!next.interests.trim()) next.interests = RF.DEFAULT_INTERESTS;

  // New interests or model means old verdicts no longer apply.
  const relearn = next.interests !== saved.interests || next.model !== saved.model;
  if (relearn) {
    next.cache = {};
    next.subStats = {};
  }
  await chrome.storage.local.set(next);
  saved = { ...saved, ...next };
  flash($("saveMsg"), relearn ? "Saved. Feed will be re-checked." : "Saved.", true);
});

$("test").addEventListener("click", () => {
  const apiKey = $("apiKey").value.trim();
  if (!apiKey) return flash($("testMsg"), "Paste a key first.", false);
  flash($("testMsg"), "Testing...", true);
  chrome.runtime.sendMessage({ type: "test", apiKey, model: $("model").value }, (res) => {
    if (chrome.runtime.lastError || !res) return flash($("testMsg"), "Could not reach the extension. Reload it.", false);
    if (res.ok) {
      // A working key is saved immediately, so forgetting to click Save can't leave you in keyword mode.
      chrome.storage.local.set({ apiKey, model: $("model").value });
      saved.apiKey = apiKey;
      flash($("testMsg"), res.text + ". Key saved.", true);
    }
    else flash($("testMsg"), "Failed: " + res.error, false);
  });
});

$("reset").addEventListener("click", async () => {
  await chrome.storage.local.set({ cache: {}, subStats: {} });
  flash($("saveMsg"), "Learning reset.", true);
});
