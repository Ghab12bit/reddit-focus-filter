const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString("en-US");

function ago(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function setBar(el, fractionFull, lowWhenLeftUnder) {
  const f = Math.max(0, Math.min(1, fractionFull));
  el.style.width = `${(f * 100).toFixed(1)}%`;
  el.classList.toggle("low", lowWhenLeftUnder);
}

function renderQuota(q, hasKey) {
  $("quotaCard").hidden = !hasKey;
  if (!hasKey) return;
  const today = new Date().toLocaleDateString("en-CA");
  if (!q || q.date !== today) {
    $("reqVal").textContent = "–";
    $("tokVal").textContent = "–";
    setBar($("reqBar"), 0, false);
    setBar($("tokBar"), 0, false);
    $("quotaWhen").textContent = "No AI calls yet today";
    return;
  }

  // Requests per day, straight from Groq's headers.
  if (q.reqLimit && q.reqLeft !== null && q.reqLeft !== undefined) {
    $("reqVal").textContent = `${fmt(q.reqLeft)} / ${fmt(q.reqLimit)}`;
    setBar($("reqBar"), q.reqLeft / q.reqLimit, q.reqLeft / q.reqLimit < 0.2);
  } else {
    $("reqVal").textContent = `${fmt(q.callsToday || 0)} used`;
    setBar($("reqBar"), 0, false);
  }

  // Tokens per day: counted by the extension (Groq doesn't send this one).
  const lim = q.dailyTokenLimit || 200000;
  const used = q.tokensToday || 0;
  $("tokVal").textContent = `${fmt(used)} / ${fmt(lim)}`;
  setBar($("tokBar"), used / lim, (lim - used) / lim < 0.2);

  const reset = q.reqReset ? ` · resets in ${q.reqReset.replace(/\.\d+s$/, "s")}` : "";
  $("quotaWhen").textContent = `Updated ${ago(q.at)}${reset}`;
}

function render(s) {
  $("enabled").checked = s.enabled !== false;
  $("state").textContent = s.enabled !== false ? "Filtering on" : "Paused";
  const today = new Date().toLocaleDateString("en-CA");
  const st = s.stats && s.stats.date === today ? s.stats : { seen: 0, hidden: 0 };
  $("hidden").textContent = st.hidden;
  $("sub").textContent = `of ${st.seen} posts checked`;
  const hasKey = !!(s.apiKey && s.apiKey.trim());
  $("dot").className = "dot " + (hasKey ? "ok" : "warn");
  $("mode").textContent = hasKey ? "AI filtering (Groq, free)" : "Keyword mode. Add a free Groq key for AI";
  renderQuota(s.quota, hasKey);
}

chrome.storage.local.get(null, render);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.quota || changes.stats || changes.apiKey)) chrome.storage.local.get(null, render);
});

$("enabled").addEventListener("change", (e) => {
  chrome.storage.local.set({ enabled: e.target.checked });
  $("state").textContent = e.target.checked ? "Filtering on" : "Paused";
});

$("checkNow").addEventListener("click", () => {
  const btn = $("checkNow");
  btn.disabled = true;
  btn.textContent = "Checking…";
  chrome.runtime.sendMessage({ type: "checkQuota" }, (res) => {
    btn.disabled = false;
    btn.textContent = "Check now";
    if (chrome.runtime.lastError || !res || !res.ok) {
      $("quotaWhen").textContent = (res && res.error) || "Check failed";
    }
  });
});

$("settings").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
