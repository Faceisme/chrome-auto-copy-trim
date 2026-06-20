const READ_CLIPBOARD_MESSAGE = "autoCopyTrim:readClipboardText";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== "offscreen" || message.type !== READ_CLIPBOARD_MESSAGE) {
    return false;
  }

  readClipboardText()
    .then((text) => sendResponse({ ok: true, text }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function readClipboardText() {
  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      return await navigator.clipboard.readText();
    }
  } catch (_) {
    // Offscreen documents may not be focused. Fall back to the legacy paste command.
  }

  const target = document.getElementById("clipboard-proxy");
  target.value = "";
  target.focus();
  target.select();

  if (!document.execCommand("paste")) {
    throw new Error("Clipboard paste command failed.");
  }

  return target.value;
}
