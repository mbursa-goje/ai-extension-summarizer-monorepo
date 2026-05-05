# AI Page Summarizer Chrome Extension

A local Manifest V3 Chrome Extension that extracts readable content from the current webpage, sends it to a secure AI backend, and displays a structured summary with key insights and estimated reading time.

The extension is not intended for the Chrome Web Store. It is loaded locally from the generated `frontend/dist` folder.

## Repository Structure

- `frontend/` contains the Chrome Extension UI, manifest, content script, background service worker, and Vite build setup.
- `backend/` contains the deployed Next.js API proxy at `/api/summarize`.
- `docs/code-walkthrough.md` contains a dense line-by-line implementation explanation, including the popup parser regex and backend API flow.

## Setup Instructions

Install frontend dependencies:

```powershell
cd frontend
npm install
```

Install backend dependencies:

```powershell
cd ..\backend
npm install
```

Create `backend/.env.local` for local backend development:

```env
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=your_openrouter_key
```

Run the backend locally:

```powershell
npm run dev
```

Build the extension:

```powershell
cd ..\frontend
npm run build
```

## Local Extension Install Steps

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `frontend/dist` folder.
6. Open a normal article page.
7. Click the **Article Summarizer** extension icon.
8. Click **Summarize Page**.

If the popup says the content script is unavailable, refresh the article page and try again. Chrome does not inject content scripts into some already-open tabs until the page is refreshed after the extension is loaded.

## Deployed Backend

The backend is deployed on Vercel:

```text
https://ai-extension-summarizer-monorepo.vercel.app
```

The extension calls:

```text
https://ai-extension-summarizer-monorepo.vercel.app/api/summarize
```

The deployed backend uses Vercel environment variables:

```env
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_API_KEY=stored_in_vercel_only
```

## Architecture Explanation

The extension uses four main pieces:

1. **Popup UI**: `frontend/src/App.tsx`
   The popup shows the page title, summarize button, loading states, structured summary sections, copy action, clear action, and error messages.

2. **Content script**: `frontend/public/content.js`
   The content script receives `EXTRACT_TEXT`, chooses `article`, `main`, or `body`, normalizes text, limits it to 8,000 characters, and returns it to the popup.

3. **Background service worker**: `frontend/public/background.js`
   The service worker receives `SUMMARIZE_PAGE`, checks `chrome.storage.local` for a cached summary, calls the deployed backend when needed, rejects empty summaries, caches successful summaries by URL, and returns the result to the popup.

4. **Backend API**: `backend/app/api/summarize/route.ts`
   The backend validates the request body, checks that `OPENROUTER_API_KEY` is configured, calls OpenRouter through the AI SDK, and returns a plain-text structured summary.

Flow:

```text
Popup -> Content script -> Popup -> Background worker -> Backend -> OpenRouter
```

Then the response returns:

```text
OpenRouter -> Backend -> Background worker -> Popup
```

## AI Integration Explanation

The backend uses OpenRouter through the AI SDK with:

```ts
openai/gpt-4o-mini
```

This model was chosen because the extension needs concise summaries rather than deep reasoning. It is cheaper and faster than heavier models, which makes it more practical for repeated local testing.

The backend prompt asks the model to return exactly these sections:

- `Summary`
- `Key insights`
- `Estimated reading time`

The popup parses those labels and renders each section separately. If a provider returns useful text without the expected labels, the popup falls back to rendering the raw summary so the user does not see a blank result.

## Security Decisions

- The OpenRouter API key is never placed in `frontend/`, `manifest.json`, `content.js`, `background.js`, or the built extension.
- The API key lives only in Vercel environment variables and local `backend/.env.local`.
- `.env` files are ignored by Git.
- The extension calls the backend proxy instead of calling OpenRouter directly.
- The popup renders summary text as React text, not raw HTML, which avoids XSS from model output.
- The content script extracts text only and does not inject model output into the page.
- The backend validates that `text` is a non-empty string before calling the AI provider.
- The background worker rejects empty backend responses before caching them.

## Trade-offs

- The extractor uses lightweight DOM heuristics instead of Mozilla Readability, so it is fast and dependency-free but may include extra page text on unusual layouts.
- The extension sends the first 8,000 characters of extracted text to control cost and reduce provider-limit failures.
- The backend returns one complete summary instead of streaming partial output into the popup. This keeps the service worker and popup message flow simpler.
- Summaries are cached by URL, which reduces duplicate API calls, but a page with changing content may need the Clear button before re-summarizing.
- In-page highlighting is not implemented. The project prioritizes reliable secure summarization, caching, and a clean popup UX.

## Verification

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Backend:

```powershell
cd backend
npm run build
```
