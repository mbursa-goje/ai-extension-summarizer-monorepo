const API_URL =
  "https://ai-extension-summarizer-monorepo.vercel.app/api/summarize";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CLEAR_SUMMARY_CACHE") {
    clearSummaryCache(message)
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to clear the cached summary.",
        });
      });

    return true;
  }

  if (!message || message.type !== "SUMMARIZE_PAGE") {
    return false;
  }

  summarizePage(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unable to summarize this page.",
      });
    });

  return true;
});

// typeof is to check the type of message.text
async function summarizePage(message) {
  const text = typeof message.text === "string" ? message.text.trim() : "";
  const url = typeof message.url === "string" ? message.url : "";

  if (!text) {
    throw new Error("No readable page text was found.");
  }

  const cacheKey = createCacheKey(url);
  const cached = await chrome.storage.local.get(cacheKey);

  if (cached[cacheKey]) {
    return {
      ok: true,
      summary: cached[cacheKey],
      cached: true,
    };
  }

  // await means wait until the request finishes and then continue with the next line of code
  const response = await fetch(API_URL, {
    // POST is a method used to send data to the server
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error("The summarizer API returned an error.");
  }

  const summary = (await response.text()).trim();

  if (!summary) {
    throw new Error("The summarizer API returned an empty summary.");
  }

  await chrome.storage.local.set({ [cacheKey]: summary });

  return {
    ok: true,
    summary,
    cached: false,
  };
}


// This function returns a cache key used as the storage key
function createCacheKey(url) {
  return `summary:${url || "current-page"}`;
}

async function clearSummaryCache(message) {
  const url = typeof message.url === "string" ? message.url : "";
  await chrome.storage.local.remove(createCacheKey(url));

  return {
    ok: true,
  };
}
