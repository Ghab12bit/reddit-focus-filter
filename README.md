# Reddit Focus Filter

A Chrome extension that hides off-topic posts from your Reddit home feed using AI.

You describe what you want to see in plain English. Every post in your Home, Popular and All feeds gets checked against that description, and anything that doesn't match collapses into a thin line you can click to reveal. Subreddit pages you open yourself are never filtered.

Built for one job: keep a Reddit feed focused on business, marketing and AI automation instead of whatever the algorithm decided to push today. Edit the interests text and it works for any topic.

## Install

1. Download this repo (Code > Download ZIP) and unzip it somewhere permanent.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder.
4. The settings page opens. Add a free Groq key (below), click **Test**, then **Save**.
5. Refresh reddit.com.

### Free AI key

1. Go to [console.groq.com/keys](https://console.groq.com/keys) and sign in. No card needed.
2. Create an API key and paste it into the settings page.

Without a key the extension still runs in keyword mode, but the AI is far more accurate.

## How it decides

Each post goes through these steps, stopping at the first match:

1. Your optional "always hide" and "always show" subreddit lists
2. A built-in list of business subreddits that are always shown
3. A cache of posts it has already checked, so nothing is classified twice
4. Learned subreddits: after 6 off-topic verdicts in a row, a sub is hidden without asking the AI
5. The AI (`openai/gpt-oss-20b` on Groq), in batches of 20 posts
6. If the AI is unavailable or rate-limited: keyword matching

If anything goes wrong, posts are shown, not hidden. The extension never blanks your feed.

## Safety and privacy

**Your Reddit account.** The extension is read-only. It reads posts already on your screen and changes how your own browser displays them, the same way an ad blocker does. It never sends requests to Reddit, never clicks, votes, joins, follows or hides anything on your account, and never uses the Reddit API.

**Your data.**
- Settings, your API key, the post cache and learned subreddits are stored in `chrome.storage.local` on your machine only. Nothing syncs and there is no server.
- For posts that need the AI, the subreddit name, title and first 160 characters go to Groq (`api.groq.com`). Nothing else leaves your browser.
- The only network permission is `api.groq.com`.

**Hardening.**
- Extension pages run under a strict Content Security Policy: no remote scripts, no `eval`, no inline scripts.
- No `web_accessible_resources`, so websites can't detect or probe the extension.
- All page content is treated as untrusted. Post IDs and subreddit names are validated against strict patterns and length-capped before they reach storage or the AI, and all UI text is written with `textContent`, never `innerHTML`.
- Only the extension's own settings page can test or use an API key. Content scripts and other extensions are rejected.
- The AI prompt tells the model to treat post text as data, so a post can't instruct the filter.
- No dependencies at runtime. Every line that runs in your browser is in this repo.

See [SECURITY.md](SECURITY.md) for reporting issues.

## Checking your free limit

The toolbar popup shows a **Groq free limit** card:

- **AI calls left today**, read live from the rate-limit headers Groq returns with every response
- **Tokens used today**, counted by the extension against the 200,000/day free allowance (Groq doesn't report daily tokens in its headers)
- **Check now** makes one tiny AI call to refresh the numbers

Bars turn amber when less than 20% is left.

## Limits

- Groq's free tier (as of October 2026) allows `gpt-oss-20b` 30 requests per minute, 1,000 per day and 8,000 tokens per minute. With batching, caching and learned subreddits that covers roughly 1,500 to 2,000 new posts a day.
- Works on new Reddit (`www.reddit.com`). Old Reddit is not supported.
- Reddit can change its page structure at any time. If that happens, the filter stops matching and your feed looks normal until the selectors are updated.

## Development

No build step. Edit the files, then click reload on the extension in `chrome://extensions`.

```
manifest.json     MV3 manifest
background.js     AI calls, cache, learning, input validation
content.js        reads the feed and hides posts
rules.js          defaults, built-in subs, keyword fallback
popup.*           toolbar popup
options.*         settings page
tests/run.js      tests against a mock Reddit feed
```

Run the tests:

```
npm install
npm test
```

## License

MIT
