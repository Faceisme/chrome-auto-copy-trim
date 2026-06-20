const READ_CLIPBOARD_MESSAGE = "autoCopyTrim:readClipboardText";
const OFFSCREEN_PATH = "offscreen.html";

let creatingOffscreenDocument = null;
let offscreenReady = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== READ_CLIPBOARD_MESSAGE || message.target === "offscreen") {
    return false;
  }

  readClipboardFromOffscreen()
    .then((text) => sendResponse({ ok: true, text }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function readClipboardFromOffscreen() {
  await ensureOffscreenDocument();
  const response = await sendRuntimeMessage({
    target: "offscreen",
    type: READ_CLIPBOARD_MESSAGE,
  });

  if (!response || !response.ok) {
    throw new Error((response && response.error) || "Unable to read clipboard.");
  }

  return response.text || "";
}

async function ensureOffscreenDocument() {
  if (!chrome.offscreen || !chrome.offscreen.createDocument) {
    throw new Error("Offscreen documents are not available in this Chrome version.");
  }

  if (offscreenReady) {
    return;
  }

  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);

  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });

    if (contexts.length > 0) {
      offscreenReady = true;
      return;
    }
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen
      .createDocument({
        url: OFFSCREEN_PATH,
        reasons: ["CLIPBOARD"],
        justification: "Read clipboard text for the optional middle-click paste feature.",
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  try {
    await creatingOffscreenDocument;
    offscreenReady = true;
  } catch (error) {
    if (String(error.message || "").includes("Only a single offscreen document")) {
      offscreenReady = true;
      return;
    }

    throw error;
  }
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      resolve(response || { ok: false });
    });
  });
}
