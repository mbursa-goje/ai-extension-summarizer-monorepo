chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type !== "EXTRACT_TEXT") return;

    const el =  
    document.querySelector("article") ||
    document.querySelector("main") ||
    document.body;

    const text = (el?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);
 sendResponse({text});
 return true;

})