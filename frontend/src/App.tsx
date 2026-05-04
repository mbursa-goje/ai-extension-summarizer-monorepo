import { useState} from "react";
import { Copy } from "lucide-react";

export function App({
  Status = "idle",
}: {
  Status?: "idle" | "extracting" | "summarizing" | "done" | "error";
}) {
  const [summary, setSummary] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "extracting" | "summarizing" | "done" | "error">(Status);
  const [pageTitle, setPageTitle] = useState("Current page");
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);

  // an asynchronous function is a function that can use await
  async function summarize(){
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

      const response = await chrome.tabs.sendMessage(tab.id!, {
        type: "EXTRACT_TEXT",
      });

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
    }catch(error){
      setErrorMessage(error instanceof Error ? error.message : "Could not summarize this page.");
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
              className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
            <p className="max-h-72 overflow-y-auto whitespace-pre-line text-sm text-gray-700 leading-relaxed">{summary}</p>
          )}

          {status === "error" && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-red-400">
                {errorMessage}
              </p>
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
              className="flex items-center justify-center text-gray-500 text-xs gap-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
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
              onClick={() => {
                setSummary("");
                setStatus("idle");
                setCopied(false);
              }}
              className="text-xs text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Clear
            </button>
          </footer>
        )}
      </div>
    );
}

export default App;
