// Shared defaults and the keyword fallback. Loaded by background.js via importScripts.
(function (g) {
  const DEFAULT_INTERESTS =
    "SHOW: business, entrepreneurship, side hustles, freelancing, agencies, digital marketing, " +
    "paid ads (Meta/Google), SEO, copywriting, sales, cold email, lead generation, e-commerce, SaaS, " +
    "AI tools and AI automation (n8n, Zapier, agents, ChatGPT/Claude workflows), making money online, " +
    "remote jobs and career growth, personal finance and investing.\n" +
    "HIDE: everything else, e.g. fitness and bodybuilding, gaming, memes, gadgets and phone specs, " +
    "entertainment, movies and TV, celebrities, sports, politics, relationships, hobbies and DIY, " +
    "pets, general news.";

  // Subreddits that are always on-topic. Matched case-insensitively, without "r/".
  const MONEY_SUBS = [
    "entrepreneur", "entrepreneurridealong", "smallbusiness", "sidehustle", "sweatystartup",
    "startups", "saas", "microsaas", "indiehackers", "marketing", "digital_marketing",
    "digitalmarketing", "ppc", "facebookads", "googleads", "adops", "seo", "bigseo", "juststart",
    "ecommerce", "shopify", "dropship", "emailmarketing", "coldemail", "sales", "freelance",
    "upwork", "agency", "automation", "n8n", "zapier", "nocode", "ai_agents", "aiagents",
    "copywriting", "content_marketing", "socialmediamarketing", "growthhacking", "passive_income",
    "workonline", "beermoney", "remotework", "digitalnomad", "growmybusiness", "affiliatemarketing",
    "claudeai", "claudecode", "aiautomations", "sideproject", "gohighlevel", "coldemailing",
    "sidehustlegold", "leadgeneration", "b2bmarketing", "agencygrowthhacks"
  ];

  const POSITIVE = [
    "business", "startup", "side hustle", "sidehustle", "revenue", "profit", "\\bmrr\\b", "\\barr\\b",
    "client", "agency", "freelanc", "marketing", "\\bads?\\b", "\\bppc\\b", "\\broas\\b", "\\bcpc\\b",
    "\\bcpl\\b", "\\bcpa\\b", "\\bctr\\b", "funnel", "conversion", "lead gen", "\\bleads\\b", "cold email",
    "outreach", "\\bseo\\b", "\\bsaas\\b", "e-?commerce", "shopify", "dropship", "automat", "\\bn8n\\b",
    "zapier", "make\\.com", "\\bai agent", "\\bagents?\\b", "\\bllm\\b", "chatgpt", "\\bclaude\\b",
    "\\bgpt", "prompt", "workflow", "income", "money", "salary", "\\bremote\\b", "career", "\\bsales\\b",
    "pricing", "customers?", "monetiz", "newsletter", "\\$\\d", "invest"
  ];
  const POSITIVE_RE = new RegExp(POSITIVE.join("|"), "i");

  function normSub(s) {
    return String(s || "").replace(/^\/?r\//i, "").trim().toLowerCase();
  }

  function parseList(text) {
    return String(text || "")
      .split(/[\s,]+/)
      .map(normSub)
      .filter(Boolean);
  }

  // Fallback when no API key or the AI is unavailable: show only clear matches.
  function keywordVerdict(post) {
    const hay = `${post.sub} ${post.title} ${post.flair || ""} ${post.text || ""}`;
    return POSITIVE_RE.test(hay)
      ? { v: "show", r: "keyword match" }
      : { v: "hide", r: "no business keywords" };
  }

  g.RF = { DEFAULT_INTERESTS, MONEY_SUBS, normSub, parseList, keywordVerdict };
})(typeof self !== "undefined" ? self : globalThis);
