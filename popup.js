(function initPopup() {
  const core = globalThis.AutoCopyCore;
  const settingIds = [
    "autoCopyPageSelection",
    "editableCtrlCopy",
    "middleClickPaste",
    "middleClickPasteOverwrite",
  ];
  const status = document.getElementById("status");
  let statusTimer = 0;

  document.addEventListener("DOMContentLoaded", start);

  async function start() {
    const settings = await readSettings();

    for (const id of settingIds) {
      const input = document.getElementById(id);
      input.checked = Boolean(settings[id]);
      input.addEventListener("change", saveSettings);
    }
  }

  function readSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(core.DEFAULT_SETTINGS, (stored) => {
        resolve(core.resolveSettings(stored));
      });
    });
  }

  function saveSettings() {
    const next = {};

    for (const id of settingIds) {
      next[id] = document.getElementById(id).checked;
    }

    chrome.storage.sync.set(next, () => {
      showStatus("已保存");
    });
  }

  function showStatus(message) {
    clearTimeout(statusTimer);
    status.textContent = message;
    statusTimer = window.setTimeout(() => {
      status.textContent = "";
    }, 1000);
  }
})();
