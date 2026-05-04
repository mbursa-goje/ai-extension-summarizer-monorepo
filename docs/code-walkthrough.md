# Code Walkthrough

This walkthrough explains the AI Page Summarizer monorepo. The `frontend` folder is the Chrome Extension. The `backend` folder is the secure AI proxy. The backend section is intentionally dense because the backend is where secrets, validation, CORS, and AI calls are handled.

## Root Implementation

### `.gitignore`

`# Dependencies` labels dependency folders that should never be committed.

`node_modules/` ignores dependencies installed at the root by accident.

`frontend/node_modules/` ignores frontend package dependencies.

`backend/node_modules/` ignores backend package dependencies.

`# Build output` labels generated artifacts.

`frontend/dist/` ignores the Chrome Extension build output because it can be regenerated with `npm run build`.

`backend/.next/` ignores the Next.js compiler cache and production build output.

`backend/out/` ignores static export output if the backend is ever exported.

`backend/build/` ignores generic build output.

`# Logs` labels local diagnostic files.

`*.log` ignores all log files.

`npm-debug.log*`, `yarn-debug.log*`, and `pnpm-debug.log*` ignore package-manager debug files.

`# Environment variables and secrets` labels private configuration.

`.env`, `.env.*`, and `*.local` ignore local environment files.

`backend/.env*` protects backend secrets such as `OPENROUTER_API_KEY`.

`frontend/.env*` protects any frontend local configuration.

`# TypeScript / framework cache` labels generated type metadata.

`*.tsbuildinfo` ignores incremental TypeScript state.

`backend/next-env.d.ts` ignores Next.js generated types.

`# Editors and OS files` labels files created by local tools.

`.DS_Store`, `.idea/`, and `.vscode/*` ignore OS and editor metadata.

`!.vscode/extensions.json` allows a shared VS Code extension recommendation file if one is added later.

`*.suo`, `*.ntvs*`, `*.njsproj`, `*.sln`, and `*.sw?` ignore IDE and temporary swap files.

### `README.md`

The root README explains how the full project works as one repository. It covers setup for both apps, the `backend/.env.local` variables, Chrome local installation, deployment, architecture, security decisions, and trade-offs.

The deployment section points to the exact frontend file that must be changed after backend deployment: `frontend/public/background.js`.

## Frontend Implementation

### `frontend/public/manifest.json`

`{` opens the manifest object Chrome reads during installation.

`"manifest_version": 3` declares Manifest V3, the required modern Chrome Extension format.

`"name": "Article Summarizer"` sets the extension name shown in Chrome.

`"version": "1.0"` sets the extension version.

`"action"` configures the extension toolbar action.

`"default_popup": "index.html"` tells Chrome to open the built React popup when the icon is clicked.

`"permissions": ["activeTab", "tabs", "storage"]` gives the extension permission to read the current tab, access tab metadata, and cache summaries.

`"host_permissions": ["<all_urls>", "https://ai-extension-summarizer-monorepo.vercel.app/*"]` allows the content script to run on webpages and allows API requests to the deployed Vercel backend.

`"background"` starts the background service worker configuration.

`"service_worker": "background.js"` registers the Manifest V3 worker that receives popup messages and performs the backend API call.

`"content_scripts"` starts the list of scripts injected into webpages.

`"matches": ["<all_urls>"]` allows the extractor to run on normal webpages.

`"js": ["content.js"]` injects the readable-text extractor.

`}` closes the manifest.

### `frontend/public/background.js`

`const API_URL = "https://ai-extension-summarizer-monorepo.vercel.app/api/summarize";` stores the deployed backend endpoint in one place. The background service worker uses this URL when it sends extracted page text to the secure backend proxy.

`chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {` listens for extension messages. The popup sends `SUMMARIZE_PAGE` here after extracting text.

`if (message?.type === "CLEAR_SUMMARY_CACHE") { ... }` handles popup requests to remove the cached summary for the current URL. This matters because the Clear button should reset the UI and let the next summarize action call the backend again instead of immediately reusing stale cached output.

`clearSummaryCache(message).then(sendResponse).catch(...)` runs the cache removal asynchronously and returns a structured `{ ok: true }` or `{ ok: false, error }` response to the popup.

`if (!message || message.type !== "SUMMARIZE_PAGE") {` validates that the message exists and is the correct action.

`return false;` tells Chrome this listener is not handling unrelated messages.

`summarizePage(message)` starts the async summarization workflow.

`.then(sendResponse)` sends success data back to the popup.

`.catch((error) => {` handles failures from validation, cache, network, or backend errors.

`sendResponse({ ok: false, error: ... })` returns a predictable error shape to the popup.

`error instanceof Error ? error.message : "Unable to summarize this page."` uses a real error message when possible and a safe fallback otherwise.

`return true;` keeps the Chrome message channel open for asynchronous work. This is required for async `sendResponse`.

`async function summarizePage(message) {` defines the background worker's main job.

`const text = typeof message.text === "string" ? message.text.trim() : "";` accepts only string content and removes outer whitespace.

`const url = typeof message.url === "string" ? message.url : "";` accepts only string URLs so cache keys cannot become arbitrary objects.

`if (!text) { throw new Error("No readable page text was found."); }` stops empty summaries before they cost an API call.

`const cacheKey = createCacheKey(url);` builds the storage key for this page.

`const cached = await chrome.storage.local.get(cacheKey);` checks extension-local storage.

`if (cached[cacheKey]) { ... }` returns a saved summary when one exists.

`summary: cached[cacheKey]` sends cached text to the popup.

`cached: true` records that the AI API was skipped.

`const response = await fetch(API_URL, { ... })` calls the secure backend proxy.

`method: "POST"` sends the page content in the request body.

`headers: { "Content-Type": "application/json" }` tells the backend to parse JSON.

`body: JSON.stringify({ text })` serializes the extracted article text.

`if (!response.ok) { ... }` catches non-success HTTP status codes from the backend.

`const errorText = await response.text();` reads the backend error body. The backend returns JSON for expected API failures, but this fallback also works if a platform returns plain text or HTML.

`let errorMessage = "The summarizer API returned an error.";` starts with a safe default message.

`JSON.parse(errorText)` attempts to parse the backend error as JSON. If the backend returns `{ "error": "..." }`, the worker can show that specific message in the popup.

`errorMessage = errorJson.error || errorMessage;` preserves the backend's useful error message when it exists.

`catch { errorMessage = errorText || errorMessage; }` falls back to the raw response text when the error body is not JSON.

`throw new Error(errorMessage);` sends the final user-readable error back to the popup.

`const summary = (await response.text()).trim();` reads the backend response as plain text and removes accidental outer whitespace.

`if (!summary) { throw new Error("The summarizer API returned an empty summary."); }` prevents the popup from entering the `done` state with a blank body. If the backend or AI provider returns an empty string, the popup now shows an error instead of a confusing empty result.

`await chrome.storage.local.set({ [cacheKey]: summary });` saves the summary by URL.

`return { ok: true, summary, cached: false };` returns the fresh summary to the popup.

`function createCacheKey(url) { return \`summary:${url || "current-page"}\`; }` namespaces cache values and handles missing URLs.

`async function clearSummaryCache(message) { ... }` removes the cached summary for a URL. It validates `message.url`, builds the same cache key used by `summarizePage`, calls `chrome.storage.local.remove`, and returns `{ ok: true }`.

### `frontend/public/content.js`

The content script listens for `EXTRACT_TEXT`, chooses `article` first, `main` second, and `body` last, reads `textContent`, collapses whitespace, trims the result, limits the text to 8,000 characters, and sends `{ text }` back to the popup. It does not inject summary HTML into the page, which keeps the page safer.

The `slice(0, 8000)` limit is a cost and reliability guard. It keeps very large pages from sending excessive input tokens to the backend. Smaller requests are cheaper, faster, and less likely to fail from provider limits.

### `frontend/src/App.tsx`

`import { useState } from "react";` imports React state management for the popup.

`import { Copy } from "lucide-react";` imports the copy icon used by the footer copy button.

`const parseSummary = (summary: string) => {` defines a parser helper outside the component. Keeping it outside `App` prevents the function from being recreated as component-local logic and keeps the parsing responsibility separate from rendering.

`const sections = { summary: "", insights: "", readingTime: "" };` creates the default structured output object. Each property starts empty so the UI can conditionally render only sections that were actually found.

`const summaryMatch = summary.match(/Summary:\s*([\s\S]*?)(?=Key insights:|$)/i);` searches the raw AI response for the `Summary:` section.

The `Summary:` part of the regex is a literal label. It means the parser expects the backend's model output to contain that exact section name.

The `\s*` part means "match zero or more whitespace characters." `\s` includes spaces, tabs, and line breaks. The `*` means there may be no whitespace or lots of whitespace after `Summary:`.

The `([\s\S]*?)` part is the capture group. Parentheses create a captured value that can be read later as `summaryMatch?.[1]`. `[\s\S]` means "match any character" because it includes both whitespace (`\s`) and non-whitespace (`\S`). This is used instead of `.` because normal dot matching does not always include newlines. The `*?` makes the match lazy, meaning it captures as little text as possible while still allowing the full regex to succeed.

The `(?=Key insights:|$)` part is a positive lookahead. It checks what comes next without consuming it. It stops the summary capture right before `Key insights:` or the end of the string. The `|` means "or." The `$` means "end of the full string."

The final `i` flag means case-insensitive matching, so `Summary:`, `summary:`, or `SUMMARY:` can match.

`const insightsMatch = summary.match(/Key insights:\s*([\s\S]*?)(?=Estimated reading time:|$)/i);` searches for the `Key insights:` section using the same regex strategy. The literal start label is `Key insights:`. The capture group collects everything after that label. The lookahead stops when `Estimated reading time:` starts or when the response ends.

`const readingTimeMatch = summary.match(/Estimated reading time:\s*([\s\S]*)/i);` searches for the final reading-time section. It uses `[\s\S]*` instead of `[\s\S]*?` because there is no next section to stop before; it can capture everything remaining after the label.

`sections.summary = summaryMatch?.[1]?.trim() || "";` stores the captured Summary text. `?.` is optional chaining, so missing matches do not crash the popup. `[1]` reads the first capture group because `[0]` would be the full matched text including the label. `trim()` removes extra line breaks and spaces. `|| ""` falls back to an empty string.

`sections.insights = insightsMatch?.[1]?.trim() || "";` stores the captured Key insights text with the same safety behavior.

`sections.readingTime = readingTimeMatch?.[1]?.trim() || "";` stores the captured Estimated reading time text.

`return sections;` returns the parsed object to the popup component.

`export function App({ Status = "idle" }: { ... }) {` defines and exports the popup component. `Status` defaults to `idle`, which means the popup waits for the user to click `Summarize Page` instead of starting automatically.

`const [summary, setSummary] = useState<string>("");` stores the raw summary returned by the background worker.

`const [status, setStatus] = useState<...>(Status);` stores the popup state. The allowed values are `idle`, `extracting`, `summarizing`, `done`, and `error`.

`const [pageTitle, setPageTitle] = useState("Current page");` stores the active tab title shown above the button and summary.

`const [pageUrl, setPageUrl] = useState("");` stores the active tab URL so the Clear button can tell the background worker which cached summary to remove.

`const [errorMessage, setErrorMessage] = useState("");` stores a human-readable error when extraction or summarization fails.

`const [copied, setCopied] = useState(false);` tracks whether the Copy button recently succeeded.

`const parsedSummary = parseSummary(summary);` converts raw backend output into structured sections on every render.

`const hasParsedSummary = parsedSummary.summary || parsedSummary.insights || parsedSummary.readingTime;` checks whether at least one expected section was found. This prevents an empty output box if the AI returns useful text without exact labels.

`async function summarize() {` defines the main popup action.

`setSummary("");`, `setErrorMessage("");`, and `setStatus("extracting");` reset old output, clear old errors, and show the extraction state.

`const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });` asks Chrome for the active tab in the current window. `chrome.tabs.query` returns an array, and `[tab]` takes the first tab from that array.

`setPageTitle(tab.title || "Current page");` displays the active tab title or a fallback label.

`setPageUrl(tab.url || "");` stores the active tab URL for cache clearing.

`if (!tab.id) { throw new Error("No active tab was found."); }` validates that Chrome returned a tab with an ID before trying to message it. `chrome.tabs.sendMessage` needs a numeric tab ID. Without this guard, the code would rely on `tab.id!`, which tells TypeScript to trust the value but does not protect runtime behavior.

`let response;` declares a variable outside the `try` block so the extracted text response can be used after the `try/catch` finishes.

`try { ... } catch { ... }` wraps the content-script message call. This is important because `chrome.tabs.sendMessage` throws when the current page does not have a receiving content script.

`response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_TEXT" });` sends `EXTRACT_TEXT` to `frontend/public/content.js` in the active tab. The message type must match the content script listener exactly. `content.js` listens for `EXTRACT_TEXT`, so using a different string such as `EXTRACT_PAGE_CONTENT` would fail.

`catch { throw new Error("Refresh this page, then try again. The content script is not available on this tab."); }` replaces Chrome's technical runtime error with a useful user-facing instruction. This catches the common extension error: `Could not establish connection. Receiving end does not exist.` That error usually means the tab was opened before the extension was loaded, the page needs a refresh, the wrong folder was loaded, or the page is restricted.

`if (!response?.text) { throw new Error("No readable page text was found."); }` validates the content script response before sending anything to the background worker. `response?.text` uses optional chaining so the popup does not crash if `response` is undefined. This guard prevents an empty backend request and gives a clearer error when the content script ran but did not extract useful text.

`setStatus("summarizing");` switches the UI from reading state to AI loading state.

`const result = await chrome.runtime.sendMessage({ type: "SUMMARIZE_PAGE", text: response.text, url: tab.url });` sends extracted text and the page URL to the background service worker.

`if (!result?.ok) { throw new Error(result?.error || "Failed to summarize"); }` converts a failed worker response into a normal JavaScript error so the `catch` block can handle it.

`setSummary(result.summary);` stores the worker's summary result.

`setStatus("done");` shows the final output and footer actions.

`catch (error) { ... }` handles Chrome API errors, extraction failures, worker errors, and backend errors.

`setErrorMessage(error instanceof Error ? error.message : "Could not summarize this page.");` stores a safe message for the popup.

`setStatus("error");` renders the retry UI.

`const handleRetry = () => { ... };` clears the summary and starts summarization again.

`const handleCopy = async () => { ... };` writes the raw summary to the clipboard, flips `copied` to true, and resets the copied label after two seconds.

`const handleClear = async () => { ... };` clears the popup output and asks the background service worker to remove the cached summary for the current page URL. This prevents an old blank or stale summary from reappearing immediately after pressing Clear.

The returned JSX renders the popup shell. The header shows the extension name and the active status. The main area shows the active page title, the `Summarize Page` button, animated loading dots, structured sections, fallback raw text, or error retry UI. The footer appears only when `status === "done"` and contains Copy and Clear actions.

The structured output block renders `Summary`, `Key insights`, and `Estimated reading time` as separate sections. Each section only appears when its parsed value is non-empty.

`!hasParsedSummary && <p ...>{summary}</p>` is the fallback renderer. If the regex parser cannot find section labels, the popup still displays the raw summary instead of appearing blank.

The Clear button calls `handleClear`, resets `summary`, returns `status` to `idle`, clears `errorMessage`, resets `copied`, and removes the page-specific summary cache through the background worker.

All interactive buttons include focus-ring classes such as `focus:outline-none`, `focus:ring-2`, `focus:ring-blue-500`, and `focus:ring-offset-2`, which makes keyboard navigation visible.

The Copy and Clear buttons also include `cursor-pointer`, so mouse users get a clear pointer cursor on hover.

### `frontend/src/main.tsx`

`main.tsx` imports React, imports the global Tailwind file, imports `App`, finds the `root` element, and renders the popup inside `StrictMode`.

### `frontend/src/index.css`

`@import "tailwindcss";` loads Tailwind so the popup utility classes compile during the Vite build.

### `frontend/vite.config.ts`

The Vite config imports `defineConfig`, the React plugin, and the Tailwind plugin. It exports `plugins: [react(), tailwindcss()]`, which gives Vite the tooling needed to compile the React popup and Tailwind styles.

## Backend Implementation

### Backend Feature Summary

The backend has five important jobs:

1. Keep the AI API key off the Chrome Extension.
2. Accept only valid article text.
3. Handle CORS for extension-to-server requests.
4. Call OpenRouter through the AI SDK.
5. Return structured plain-text output for the popup.

### `backend/lib/ai.ts`

```ts
import { createOpenAI } from "@ai-sdk/openai";
```

This line imports `createOpenAI`, a factory function from the AI SDK. OpenRouter uses an OpenAI-compatible API format, so this OpenAI helper can create a provider client that talks to OpenRouter. The import lives in the backend only, so none of this provider setup is shipped inside the Chrome Extension.

```ts
export const openrouter = createOpenAI({
```

This creates an OpenRouter-compatible provider and exports it. Exporting it lets API routes import the same configured provider instead of repeating setup code. The name `openrouter` is lowercase because it is a configured value, not a class or React component.

```ts
  baseURL: process.env.OPENROUTER_BASE_URL!,
```

This sets the provider's base URL from an environment variable. `process.env` reads server environment values. In local development, this comes from `backend/.env.local`. In production, it comes from Vercel or the deployment platform. The `!` is TypeScript's non-null assertion, meaning the code promises this value exists. The line is security-sensitive because the endpoint is configured server-side rather than in extension code.

```ts
  apiKey: process.env.OPENROUTER_API_KEY!,
```

This sets the private API key from an environment variable. This is the main reason the backend exists: the key stays on the server and is never exposed in `manifest.json`, `background.js`, `content.js`, or React popup code. If this were placed in the frontend, anyone could inspect the extension package and steal it.

```ts
});
```

This closes the `createOpenAI` configuration object and finishes creating the provider.

```ts
export const SUMMARIZE_MODEL = "openai/gpt-4o-mini";
```

This stores the selected summarization model in one exported constant. The route imports this value when it calls the AI provider. Keeping the model in a constant makes upgrades simple and avoids burying a model string inside request logic. The id uses OpenRouter's model naming format for OpenAI GPT-4o mini.

GPT-4o mini is intentionally used here because the extension needs concise page summaries, not deep reasoning. A smaller model is cheaper, faster, and better for repeated testing. Heavy frontier models can fail or become expensive during repeated trials because provider credits, rate limits, output token limits, and account quotas can be exhausted.

### `backend/app/api/summarize/route.ts`

```ts
import { NextRequest } from "next/server";
```

This imports the Next.js request type. The `POST` function receives `req: NextRequest`, so TypeScript can understand methods like `req.json()`.

```ts
import { generateText } from "ai";
```

This imports the AI SDK text generation helper. `generateText` waits for the model to finish and returns a normal text result. The extension expects a complete summary string, so this is simpler and more reliable than streaming for the current popup flow.

```ts
import { openrouter, SUMMARIZE_MODEL } from "@/lib/ai";
```

This imports the configured OpenRouter provider and model name. The `@/` alias resolves to the backend project root because `backend/tsconfig.json` maps `@/*` to `./*`.

```ts
export const runtime = "edge";
```

This tells Next.js to run the route in the Edge runtime. The summarize route is stateless and mostly waits on a network call, so Edge is appropriate. It can reduce cold-start weight compared with a larger Node runtime.

```ts
const CORS_HEADERS = {
```

This starts a shared object of CORS headers. CORS matters because the Chrome Extension origin is different from the backend origin.

```ts
  "Access-Control-Allow-Origin": "*",
```

This allows any origin to read the response. That is convenient for local extension development because extension IDs can change. For a production commercial extension, this would usually be narrowed.

```ts
  "Access-Control-Allow-Methods": "POST, OPTIONS",
```

This tells the browser that the route supports `POST` for real summary requests and `OPTIONS` for preflight requests.

```ts
  "Access-Control-Allow-Headers": "Content-Type",
```

This allows the request to include `Content-Type: application/json`, which the background worker sends.

```ts
};
```

This closes the shared CORS header object.

```ts
export async function OPTIONS() {
```

This defines the preflight handler. Browsers may send an `OPTIONS` request before the `POST` because JSON requests with custom content type can trigger CORS preflight.

```ts
  return new Response(null, {
```

This creates a response with no body. Preflight responses only need status and headers.

```ts
    status: 204,
```

This uses HTTP 204, meaning success with no content.

```ts
    headers: CORS_HEADERS,
```

This attaches the CORS permissions to the preflight response, allowing the browser to proceed with the real request.

```ts
  });
```

This closes the `Response` constructor call.

```ts
}
```

This closes the `OPTIONS` function.

```ts
export async function POST(req: NextRequest) {
```

This defines the actual summarization endpoint. Next.js maps it to `POST /api/summarize`.

```ts
  const body = await req.json();
```

This parses the JSON request body. The background worker sends `{ text }`, so this line reads that object.

```ts
  const text = typeof body.text === "string" ? body.text.trim() : "";
```

This validates input. If `body.text` is a string, the backend trims it. If it is missing or any other type, the backend uses an empty string. This prevents invalid data from being sent to the AI provider.

```ts
  if (!text) {
```

This checks whether there is real content after validation and trimming.

```ts
    return Response.json(
```

This starts a JSON error response.

```ts
      { error: "A non-empty text field is required." },
```

This is the response body. It tells the caller exactly what field is missing without exposing server internals.

```ts
      { status: 400, headers: CORS_HEADERS },
```

This returns HTTP 400 because the request was invalid. It also includes CORS headers so the extension can read the error message.

```ts
    );
```

This closes the JSON response call.

```ts
  }
```

This closes the validation branch.

```ts
  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json(
      { error: "OPENROUTER_API_KEY is not configured in the backend." },
      { status: 502, headers: CORS_HEADERS },
    );
  }
```

This checks whether the deployed backend can read the OpenRouter API key before making the provider request. If Vercel does not have `OPENROUTER_API_KEY`, or the deployment did not pick up the environment variable, the route returns a clear JSON error instead of letting OpenRouter fail with `Missing Authentication header`.

```ts
  try {
```

This starts backend error handling around the AI provider call. Without this block, provider failures become a generic Next.js 500 page.

```ts
    const result = await generateText({
```

This starts the AI request and waits for the model to return text. The route uses `await` because it needs the final summary before creating the HTTP response.

```ts
    model: openrouter(SUMMARIZE_MODEL),
```

This chooses the model through the configured OpenRouter provider. The provider injects the server-side API key when the request is made.

```ts
    system: `You are a concise article summarizer.
```

This starts the system prompt. The system prompt is the instruction layer that tells the model how to behave.

```text
Return a structured summary using exactly these sections:
```

This forces predictable sections for the popup output.

```text
Summary:
- 3 to 5 bullet points, one sentence each.
```

This satisfies the required bullet-point summary feature.

```text
Key insights:
- 2 to 3 bullet points explaining the most important ideas.
```

This satisfies the key-insights requirement.

```text
Estimated reading time:
- One short sentence using the article length.
```

This satisfies the estimated-reading-time requirement.

```text
Rules:
- Do not add opinions.
- Do not add a preamble or conclusion.
- Use plain text only.`,
```

These rules keep the model factual, compact, and safe for rendering as text in the popup.

```ts
    messages: [{ role: "user", content: text }],
```

This sends the extracted webpage content to the model as the user message.

```ts
    maxOutputTokens: 260,
```

This limits the generated response. The value gives enough room for summary bullets, key insights, and reading time while keeping output cost lower. Output tokens are often more expensive than input tokens, so this cap is a direct cost-control measure.

```ts
  });
```

This closes the AI request configuration.

```ts
    const summary = result.text.trim();
```

This reads the generated text from the AI SDK result and trims accidental outer whitespace.

```ts
    if (!summary) {
```

This checks whether the AI provider returned an empty string.

```ts
    return Response.json(
      { error: "The AI provider returned an empty summary." },
      { status: 502, headers: CORS_HEADERS },
    );
  }
```

This returns a 502 Bad Gateway style error when the upstream AI provider gives an unusable empty response. The frontend can show this as a real error instead of a blank successful state.

```ts
    return new Response(summary, {
```

This creates a normal plain-text HTTP response containing the generated summary.

```ts
    headers: CORS_HEADERS,
```

This attaches CORS headers to the successful response so the extension can read it.

```ts
  } catch (error) {
```

This catches AI SDK, OpenRouter, model, authentication, and network failures.

```ts
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The AI provider could not generate a summary.",
      },
      { status: 502, headers: CORS_HEADERS },
    );
```

This returns provider failures as readable JSON with a 502 status. The background worker reads this JSON and displays the message in the popup, which is much more useful than a blank result or a generic HTML error page.

```ts
  });
```

This closes the response conversion.

```ts
}
```

This closes the POST handler.

### `backend/app/layout.tsx`

This file is the Next.js root layout. It imports metadata types, Google fonts, and global CSS. It defines `geistSans` and `geistMono`, exports metadata, and renders all pages inside `<html lang="en">` and `<body>`. It is part of the app shell, not the summarization API.

### `backend/app/page.tsx`

This is the default Next.js starter page. It renders a basic landing page using `next/image` and `page.module.css`. It is not used by the extension flow, because the extension calls `/api/summarize` directly.

### `backend/app/globals.css`

This file sets CSS variables for background and foreground colors, handles dark mode, sets page height, prevents horizontal overflow, sets global font rendering, resets spacing, and gives links inherited color. It affects the backend's default webpage, not the API response.

### `backend/next.config.ts`

This file imports the `NextConfig` type, creates an empty typed configuration object, and exports it. It is ready for future Next.js settings.

### `backend/tsconfig.json`

This file configures TypeScript for the backend. It enables strict mode, DOM and ESNext libraries, JSX support, JSON imports, isolated modules, the Next.js plugin, incremental compilation, and the `@/*` alias used in the API route.

## End-To-End Implementation Flow

1. The user opens a webpage.
2. The user clicks the extension icon.
3. Chrome opens the React popup.
4. The user clicks `Summarize Page`.
5. The popup asks Chrome for the active tab.
6. The popup sends `EXTRACT_TEXT` to `content.js`.
7. `content.js` extracts readable text.
8. The popup sends `SUMMARIZE_PAGE` to `background.js`.
9. `background.js` checks `chrome.storage.local`.
10. If cached, it returns the cached summary.
11. If not cached, it calls the backend API.
12. The backend validates JSON.
13. The backend calls OpenRouter with the server-side API key.
14. The backend streams a structured summary.
15. The background worker caches the summary by URL.
16. The popup displays the result.

## Deployment URL

The backend is deployed on Vercel at:

```
https://ai-extension-summarizer-monorepo.vercel.app
```

The extension calls this API route:

```js
const API_URL =
  "https://ai-extension-summarizer-monorepo.vercel.app/api/summarize";
```

The manifest allows requests to that deployed host:

```json
"host_permissions": [
  "<all_urls>",
  "https://ai-extension-summarizer-monorepo.vercel.app/*"
]
```

After changing either deployment value, rebuild the extension with `npm run build` inside `frontend` and reload `frontend/dist` in Chrome.
