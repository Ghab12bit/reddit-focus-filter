const $ = (id) => document.getElementById(id);

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
}

chrome.storage.local.get(null, render);

$("enabled").addEventListener("change", (e) => {
  chrome.storage.local.set({ enabled: e.target.checked });
  $("state").textContent = e.target.checked ? "Filtering on" : "Paused";
});

$("settings").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
