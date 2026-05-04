import { useState } from "react";
import { Copy } from "lucide-react";

const parseSummary = (summary: string) => {
  const sections = {
    summary: "",
    insights: "",
    readingTime: "",
  };

  const summaryMatch = summary.match(
    /Summary:\s*([\s\S]*?)(?=Key insights:|$)/i,
  );
  const insightsMatch = summary.match(
    /Key insights:\s*([\s\S]*?)(?=Estimated reading time:|$)/i,
  );
  const readingTimeMatch = summary.match(
    /Estimated reading time:\s*([\s\S]*)/i,
  );

  sections.summary = summaryMatch?.[1]?.trim() || "";
  sections.insights = insightsMatch?.[1]?.trim() || "";
  sections.readingTime = readingTimeMatch?.[1]?.trim() || "";

  return sections;
};
export function App({
  Status = "idle",
}: {
  Status?: "idle" | "extracting" | "summarizing" | "done" | "error";
}) {
  const [summary, setSummary] = useState<string>("");
  const [status, setStatus] = useState<
    "idle" | "extracting" | "summarizing" | "done" | "error"
  >(Status);
  const [pageTitle, setPageTitle] = useState("Current page");
  const [pageUrl, setPageUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const parsedSummary = parseSummary(summary);
  const hasParsedSummary =
    parsedSummary.summary ||
    parsedSummary.insights ||
    parsedSummary.readingTime;

  // an asynchronous function is a function that can use await
  async function summarize() {
    try {
      setSummary("");
      setErrorMessage("");
      setStatus("extracting");

      // This asks chrome for the currently active tab in the current browser window
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      setPageTitle(tab.title || "Current page");
      setPageUrl(tab.url || "");

      if (!tab.id) {
        throw new Error("No active tab was found.");
      }

      let response;

      try {
        response = await chrome.tabs.sendMessage(tab.id, {
          type: "EXTRACT_TEXT",
        });
      } catch {
        throw new Error(
          "Refresh this page, then try again. The content script is not available on this tab.",
        );
      }

      if (!response?.text) {
        throw new Error("No readable page text was found.");
      }

      setStatus("summarizing");

      const result = await chrome.runtime.sendMessage({
        type: "SUMMARIZE_PAGE",
        text: response.text,
        url: tab.url,
      });

      if (!result?.ok) {
        throw new Error(result?.error || "Failed to summarize");
      }

      setSummary(result.summary);

      setStatus("done");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not summarize this page.",
      );
      setStatus("error");
    }
  }

  const handleRetry = () => {
    setSummary("");
    setStatus("extracting");
    summarize();
  };
  const handleCopy = async () => {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = async () => {
    if (pageUrl) {
      await chrome.runtime.sendMessage({
        type: "CLEAR_SUMMARY_CACHE",
        url: pageUrl,
      });
    }

    setSummary("");
    setStatus("idle");
    setErrorMessage("");
    setCopied(false);
  };

  return (
    <div className="w-96 min-h-50 bg-white flex flex-col">
      <header className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h3 className="inline-block text-sm font-semibold">
            Article Summarizer
          </h3>
        </div>

        {status === "extracting" && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" />
            Reading...
          </span>
        )}

        {status === "summarizing" && (
          <span className="flex items-center gap-3.5 text-xs text-blue-400">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Summarizing...
          </span>
        )}

        {status === "done" && (
          <span className="text-xs text-green-500">Done!</span>
        )}
      </header>

      {/* Body */}
      <main className="flex-1 px-4 py-3">
        <p className="mb-3 line-clamp-2 text-xs font-medium text-gray-500">
          {pageTitle}
        </p>

        {status === "idle" && (
          <button
            onClick={summarize}
            className="mt-3 w-full cursor-pointer rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Summarize Page
          </button>
        )}

        {status === "summarizing" && !summary && (
          <div className="flex items-center gap-1 py-2">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:8ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:150ms]" />
            <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce [animation-delay:300ms]" />
            {/* <span className="pl-2 text bg-gray-300">Summarizing</span> */}
          </div>
        )}

        {summary && (
          <div className="max-h-72 overflow-y-auto space-y-4 text-sm text-gray-700">
            {parsedSummary.summary && (
              <section>
                <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">
                  Summary
                </h4>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {parsedSummary.summary}
                </p>
              </section>
            )}

            {parsedSummary.insights && (
              <section>
                <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">
                  Key insights
                </h4>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {parsedSummary.insights}
                </p>
              </section>
            )}

            {parsedSummary.readingTime && (
              <section>
                <h4 className="mb-1 text-xs font-semibold uppercase text-gray-500">
                  Estimated reading time
                </h4>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {parsedSummary.readingTime}
                </p>
              </section>
            )}

            {!hasParsedSummary && (
              <p className="whitespace-pre-wrap leading-relaxed">{summary}</p>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-red-400">{errorMessage}</p>
            <button
              onClick={handleRetry}
              className="self-start text-xs text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Try again
            </button>
          </div>
        )}
      </main>

      {status === "done" && (
        <footer className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-3">
          <button
            onClick={handleCopy}
            className="flex cursor-pointer items-center justify-center gap-1.5 text-xs text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            {copied ? (
              <>
                {" "}
                <Copy size={20} />
                <span className="text-green-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy size={20} />
                <span className="text-green-500">Copy</span>
              </>
            )}
          </button>
          <button
            onClick={handleClear}
            className="cursor-pointer text-xs text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Clear
          </button>
        </footer>
      )}
    </div>
  );
}

export default App;
