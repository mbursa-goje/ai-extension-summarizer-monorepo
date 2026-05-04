# AI Page Summarizer Chrome Extension

This repository contains a Manifest V3 Chrome Extension and a secure Next.js API proxy for AI-powered page summaries.

## Project Structure

- `frontend/` contains the installable Chrome Extension popup, content script, background service worker, manifest, and UI source.
- `backend/` contains the Next.js `/api/summarize` route that calls OpenRouter with a server-side API key.
- `docs/code-walkthrough.md` explains the implementation line by line, with extra detail for the backend.

## Local Setup

Install dependencies in both apps:

```powershell
cd frontend
npm install
cd ..\backend
npm install
```

Create `backend/.env.local`:

```env
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=your_api_key_here
```

Run the backend:

```powershell
cd backend
npm run dev
```

Build the extension:

```powershell
cd frontend
npm run build
```

Load the local extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `frontend/dist` folder.
5. Open an article page and click the Article Summarizer extension icon.

## Deployment

Deploy the `backend` folder to Vercel or another Next.js host. After deployment, update `frontend/public/background.js`:

```js
const API_URL = "https://your-deployed-site.vercel.app/api/summarize";
```

Also update `frontend/public/manifest.json` so `host_permissions` includes your deployed backend domain.

## Architecture

The popup UI asks the active tab for readable page text. The content script extracts text from `article`, `main`, or `body`. The popup sends the extracted text and URL to the background service worker. The service worker checks `chrome.storage.local` for a cached summary, calls the backend when needed, stores the result, and returns it to the popup.

The backend owns the AI API key. It validates incoming JSON, handles CORS preflight requests, calls OpenRouter through the AI SDK, and streams a structured plain-text summary back to the extension.

## Security Decisions

- No AI API key is committed or shipped in frontend code.
- The extension calls a proxy backend instead of calling OpenRouter directly.
- `chrome.storage.local` caches generated summaries by URL to reduce repeated API calls.
- The popup renders summary text as text, not raw HTML.
- The content script only extracts text and does not inject generated content into the page.

## Trade-offs

- The content extractor uses lightweight heuristics instead of a full Readability parser, so it is fast but may include extra text on unusual pages.
- The background worker returns a complete summary after the backend finishes, rather than streaming partial text into the popup.
- Highlighting key points in-page is not implemented yet because the core secure summarization flow was prioritized.
