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

`"host_permissions": ["<all_urls>", "http://localhost:3000/*"]` allows the content script to run on webpages and allows local backend API requests. Before deployment, add the deployed backend host here.

`"background"` starts the background service worker configuration.

`"service_worker": "background.js"` registers the Manifest V3 worker that receives popup messages and performs the backend API call.

`"content_scripts"` starts the list of scripts injected into webpages.

`"matches": ["<all_urls>"]` allows the extractor to run on normal webpages.

`"js": ["content.js"]` injects the readable-text extractor.

`}` closes the manifest.

### `frontend/public/background.js`

`const API_URL = "http://localhost:3000/api/summarize";` stores the backend endpoint in one place. This is the line to replace with the deployed URL later.

`chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {` listens for extension messages. The popup sends `SUMMARIZE_PAGE` here after extracting text.

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

`if (!response.ok) { throw new Error(...) }` catches non-success HTTP status codes.

`const summary = await response.text();` reads the backend response as plain text.

`await chrome.storage.local.set({ [cacheKey]: summary });` saves the summary by URL.

`return { ok: true, summary, cached: false };` returns the fresh summary to the popup.

`function createCacheKey(url) { return \`summary:${url || "current-page"}\`; }` namespaces cache values and handles missing URLs.

### `frontend/public/content.js`

The content script listens for `EXTRACT_TEXT`, chooses `article` first, `main` second, and `body` last, reads `textContent`, collapses whitespace, trims the result, limits the text to 10,000 characters, and sends `{ text }` back to the popup. It does not inject summary HTML into the page, which keeps the page safer.

### `frontend/src/App.tsx`

`useState` stores popup state: summary text, current status, page title, error message, and copy state. The `summarize` function queries the active tab, requests extracted text from `content.js`, sends that text to `background.js`, receives a summary, and updates the UI. The returned JSX renders the title, `Summarize Page` button, loading indicators, scrollable summary, retry state, copy button, clear button, and keyboard focus rings.

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
export const SUMMARIZE_MODEL = "anthropic/claude-3-5-sonnet-20240909";
```

This stores the selected summarization model in one exported constant. The route imports this value when it calls the AI provider. Keeping the model in a constant makes upgrades simple and avoids burying a model string inside request logic.

### `backend/app/api/summarize/route.ts`

```ts
import { NextRequest } from "next/server";
```

This imports the Next.js request type. The `POST` function receives `req: NextRequest`, so TypeScript can understand methods like `req.json()`.

```ts
import { streamText } from "ai";
```

This imports the AI SDK streaming helper. `streamText` sends prompt instructions and messages to the selected model, then returns a result object that can be converted into an HTTP streaming response.

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
  const result = streamText({
```

This starts the AI request. `result` is not plain text yet; it is an AI SDK result object that can produce a text stream response.

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
    maxOutputTokens: 450,
```

This limits the generated response. The value gives room for all required sections while controlling cost and latency.

```ts
  });
```

This closes the AI request configuration.

```ts
  return result.toTextStreamResponse({
```

This converts the AI SDK result into an HTTP response that streams plain text.

```ts
    headers: CORS_HEADERS,
```

This attaches CORS headers to the successful response.

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

## Deployment Edits

In `frontend/public/background.js`, replace:

```js
const API_URL = "http://localhost:3000/api/summarize";
```

with your deployed backend URL:

```js
const API_URL = "https://your-deployed-site.vercel.app/api/summarize";
```

In `frontend/public/manifest.json`, add the deployed host:

```json
"host_permissions": ["<all_urls>", "https://your-deployed-site.vercel.app/*"]
```
