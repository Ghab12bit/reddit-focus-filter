# Security

## Reporting

If you find a security issue, please open a private security advisory on this repo (Security > Report a vulnerability) instead of a public issue.

## Your API key

- Your Groq key is stored only in `chrome.storage.local` in your own browser profile. It is never committed, synced or sent anywhere except `api.groq.com`.
- Never paste your key into an issue, screenshot or commit. If you think it leaked, delete it at [console.groq.com/keys](https://console.groq.com/keys) and create a new one.

## If you fork this

- Don't hardcode an API key in any file.
- If you use Chrome's "Pack extension", it creates a `.pem` private key. Keep it out of the repo (already in `.gitignore`).
- Keep `host_permissions` limited to the AI endpoint you actually call.
