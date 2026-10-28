// Runs on reddit.com. Read-only: it reads posts already on screen and changes how they display.
// It never sends requests to Reddit, never clicks, votes, joins or hides anything on your account.
(() => {
  const FEED_PATHS = new Set(["/", "/best", "/hot", "/new", "/top", "/rising", "/home"]);
  const BATCH = 20;
  const PENDING_TIMEOUT_MS = 60000; // the background spaces AI calls to respect the free tier

  let settings = { enabled: true, mode: "collapse" };
  let queue = [];
  let flushTimer = null;
  let scanTimer = null;
  let alive = true;

  function isFeedPage() {
    const p = location.pathname.replace(/\/+$/, "") || "/";
    if (FEED_PATHS.has(p)) return true;
    return /^\/r\/(popular|all)(\/|$)/i.test(location.pathname);
  }

  function attr(el, name) {
    const v = el.getAttribute(name);
    return v ? v.trim() : "";
  }

  function textOf(el, sel) {
    const n = el.querySelector(sel);
    return n ? n.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function extract(post) {
    const id = attr(post, "id") || attr(post, "permalink") || attr(post, "post-title");
    const sub =
      attr(post, "subreddit-prefixed-name") ||
      (attr(post, "subreddit-name") ? "r/" + attr(post, "subreddit-name") : "") ||
      textOf(post, 'a[href^="/r/"]');
    const title = attr(post, "post-title") || textOf(post, '[slot="title"]') || textOf(post, "h2, h3");
    const flair = textOf(post, "shreddit-post-flair");
    const text = textOf(post, '[slot="text-body"]').slice(0, 300);
    return { id, sub, title, flair, text };
  }

  function containerOf(post) {
    return post.closest("article") || post;
  }

  function removeBar(container) {
    const prev = container.previousElementSibling;
    if (prev && prev.classList.contains("rf-bar")) prev.remove();
  }

  function reveal(container) {
    container.classList.remove("rf-hidden", "rf-pending");
    removeBar(container);
  }

  function applyVerdict(post, verdict, sub) {
    const c = containerOf(post);
    c.classList.remove("rf-pending");
    post.setAttribute("data-rf", verdict.v);
    if (verdict.v !== "hide") return reveal(c);

    c.classList.add("rf-hidden");
    if (settings.mode !== "collapse") return;
    removeBar(c);

    const bar = document.createElement("div");
    bar.className = "rf-bar";
    const label = document.createElement("span");
    label.className = "rf-label";
    label.textContent = `Hidden · ${sub || "post"}${verdict.r ? " · " + verdict.r : ""}`;
    const show = document.createElement("button");
    show.type = "button";
    show.className = "rf-btn";
    show.textContent = "Show";
    show.addEventListener("click", () => {
      post.setAttribute("data-rf", "show");
      reveal(c);
    });
    bar.append(label, show);

    if (sub) {
      const always = document.createElement("button");
      always.type = "button";
      always.className = "rf-btn rf-btn-quiet";
      always.textContent = `Always show ${sub}`;
      always.addEventListener("click", () => {
        safeSend({ type: "alwaysShow", sub }, () => {});
        post.setAttribute("data-rf", "show");
        reveal(c);
      });
      bar.append(always);
    }
    c.parentNode && c.parentNode.insertBefore(bar, c);
  }

  function safeSend(msg, cb) {
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) return cb(null);
        cb(res);
      });
    } catch (_) {
      alive = false; // extension was reloaded; this old script should stop touching the page
      cb(null);
    }
  }

  function flush() {
    flushTimer = null;
    if (!queue.length) return;
    const batch = queue.splice(0, BATCH);
    if (queue.length) flushTimer = setTimeout(flush, 50);

    const byId = new Map(batch.map((b) => [b.data.id, b]));
    const timeout = setTimeout(() => {
      for (const b of batch) {
        if (b.post.getAttribute("data-rf") === "pending") {
          b.post.setAttribute("data-rf", "show");
          reveal(containerOf(b.post));
        }
      }
    }, PENDING_TIMEOUT_MS);

    safeSend({ type: "classify", posts: batch.map((b) => b.data) }, (res) => {
      clearTimeout(timeout);
      const results = res && res.ok ? res.results : {};
      for (const [id, b] of byId) {
        if (!b.post.isConnected || b.post.getAttribute("data-rf") !== "pending") continue;
        const v = results[id] || { v: "show", r: "" }; // fail open: never hide on error
        applyVerdict(b.post, v, b.data.sub);
      }
    });
  }

  function scan() {
    scanTimer = null;
    if (!alive || !settings.enabled || !isFeedPage()) return;

    document.querySelectorAll("shreddit-ad-post:not([data-rf])").forEach((ad) => {
      ad.setAttribute("data-rf", "ad");
      containerOf(ad).classList.add("rf-hidden");
    });

    document.querySelectorAll("shreddit-post:not([data-rf])").forEach((post) => {
      const data = extract(post);
      if (!data.id || !data.title) {
        post.setAttribute("data-rf", "skip");
        return;
      }
      post.setAttribute("data-rf", "pending");
      containerOf(post).classList.add("rf-pending");
      queue.push({ post, data });
    });

    if (queue.length && !flushTimer) flushTimer = setTimeout(flush, 250);
  }

  function scheduleScan() {
    if (!scanTimer) scanTimer = setTimeout(scan, 200);
  }

  function resetAll() {
    queue = [];
    document.querySelectorAll(".rf-bar").forEach((b) => b.remove());
    document.querySelectorAll(".rf-hidden, .rf-pending").forEach((c) => c.classList.remove("rf-hidden", "rf-pending"));
    document.querySelectorAll("[data-rf]").forEach((p) => p.removeAttribute("data-rf"));
  }

  chrome.storage.local.get({ enabled: true, mode: "collapse" }, (s) => {
    settings = s;
    scan();
    new MutationObserver(scheduleScan).observe(document.documentElement, { childList: true, subtree: true });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const keys = ["enabled", "mode", "alwaysShow", "alwaysHide", "interests", "apiKey", "model"];
    if (!keys.some((k) => k in changes)) return;
    if (changes.enabled) settings.enabled = changes.enabled.newValue;
    if (changes.mode) settings.mode = changes.mode.newValue;
    resetAll();
    scan();
  });
})();
