(function initContentScript() {
  const core = globalThis.AutoCopyCore;
  const READ_CLIPBOARD_MESSAGE = "autoCopyTrim:readClipboardText";
  const MODIFIER_KEYS = new Set(["Alt", "CapsLock", "Control", "Meta", "Shift", "Tab"]);

  let settings = core.resolveSettings();
  let lastCopyText = "";
  let lastCopyAt = 0;
  let lastMiddlePasteAt = 0;
  let lastMiddlePasteTarget = null;
  let toastElement = null;
  let toastTimer = 0;

  start();

  function start() {
    // 同步挂载监听器,使中键粘贴在脚本注入后立即可用,无需等待页面或
    // 设置加载完成。settings 已用默认值同步初始化,稍后再用存储值覆盖。
    document.addEventListener("mouseup", handleMouseUp, true);
    document.addEventListener("keyup", handleKeyUp, true);
    document.addEventListener("mousedown", handleMiddlePaste, true);
    document.addEventListener("auxclick", handleAuxClick, true);

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      const next = { ...settings };
      for (const [key, change] of Object.entries(changes)) {
        next[key] = change.newValue;
      }
      settings = core.resolveSettings(next);
    });

    // 在后台读取存储的设置,到达前先沿用默认值。
    readSettings().then((loaded) => {
      settings = loaded;
    });
  }

  function readSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(core.DEFAULT_SETTINGS, (stored) => {
        resolve(core.resolveSettings(stored));
      });
    });
  }

  function handleMouseUp(event) {
    if (event.button !== 0) {
      return;
    }

    copySelectionFromEvent(event);
  }

  function handleKeyUp(event) {
    if (MODIFIER_KEYS.has(event.key)) {
      return;
    }

    copySelectionFromEvent(event);
  }

  async function copySelectionFromEvent(event) {
    const info = getSelectionInfo(event.target, event.type === "keyup");

    if (
      !core.shouldCopySelection({
        text: info.text,
        editable: info.editable,
        ctrlKey: Boolean(event.ctrlKey),
        settings,
      })
    ) {
      return;
    }

    const normalized = core.normalizeCopyText(info.text);
    const now = Date.now();

    if (normalized === lastCopyText && now - lastCopyAt < 700) {
      return;
    }

    const copied = await writeClipboardText(normalized);
    if (!copied) {
      return;
    }

    lastCopyText = normalized;
    lastCopyAt = now;
    showOptionalToast(core.getToastMessage("copySuccess"), event);
  }

  function getSelectionInfo(target, allowActiveTextInput) {
    const activeElement = document.activeElement;
    const activeInputSelection = getTextInputSelection(activeElement);

    if (activeInputSelection.hasSelection) {
      return {
        editable: true,
        text: activeInputSelection.text,
      };
    }

    const selectionTarget =
      core.isTextInputElement(target) ? target : allowActiveTextInput ? activeElement : target;

    if (core.isTextInputElement(selectionTarget)) {
      const inputSelection = getTextInputSelection(selectionTarget);

      if (inputSelection.hasSelection) {
        return {
          editable: true,
          text: inputSelection.text,
        };
      }

      return { editable: true, text: "" };
    }

    const selection = window.getSelection();
    const rangeTarget =
      selection && selection.rangeCount > 0 ? selection.getRangeAt(0).commonAncestorContainer : target;

    return {
      editable: core.resolveSelectionEditableState({
        eventTargetEditable: core.isEditableTarget(target),
        activeTextInputHasSelection: activeInputSelection.hasSelection,
        selectionRangeEditable: core.isEditableTarget(rangeTarget),
      }),
      text: selection ? selection.toString() : "",
    };
  }

  function getTextInputSelection(target) {
    if (!core.isTextInputElement(target)) {
      return {
        hasSelection: false,
        text: "",
      };
    }

    const start = target.selectionStart;
    const end = target.selectionEnd;

    if (typeof start !== "number" || typeof end !== "number" || end <= start) {
      return {
        hasSelection: false,
        text: "",
      };
    }

    return {
      hasSelection: true,
      text: target.value.slice(start, end),
    };
  }

  function isClipboardFeatureAllowed(feature) {
    // Calling navigator.clipboard in a frame whose permissions policy blocks
    // it gets reported as an extension error even when caught, so check the
    // policy up front (e.g. the google.com iframe inside chrome://whats-new/).
    const policy = document.permissionsPolicy || document.featurePolicy;
    if (!policy || typeof policy.allowsFeature !== "function") {
      return true;
    }

    try {
      return policy.allowsFeature(feature);
    } catch (_) {
      return true;
    }
  }

  async function writeClipboardText(text) {
    try {
      if (
        navigator.clipboard &&
        navigator.clipboard.writeText &&
        isClipboardFeatureAllowed("clipboard-write")
      ) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      // Fall back to the extension-permitted copy command below.
    }

    return copyWithExecCommand(text);
  }

  function copyWithExecCommand(text) {
    const onCopy = (event) => {
      event.clipboardData.setData("text/plain", text);
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    document.addEventListener("copy", onCopy, true);
    try {
      return document.execCommand("copy");
    } catch (_) {
      return false;
    } finally {
      document.removeEventListener("copy", onCopy, true);
    }
  }

  async function handleAuxClick(event) {
    if (event.button !== 1) {
      return;
    }

    const pasteTarget = getEditableInsertionTarget(event.target);
    const recentlyHandled =
      pasteTarget && pasteTarget === lastMiddlePasteTarget && Date.now() - lastMiddlePasteAt < 900;

    if (recentlyHandled) {
      stopMiddleClickEvent(event);
      return;
    }

    await handleMiddlePaste(event);
  }

  async function handleMiddlePaste(event) {
    const pasteTarget = getEditableInsertionTarget(event.target);

    if (
      !core.shouldHandleMiddlePasteEvent({
        type: event.type,
        button: event.button,
        editable: Boolean(pasteTarget),
        middleClickPaste: settings.middleClickPaste,
      })
    ) {
      return;
    }

    stopMiddleClickEvent(event);

    lastMiddlePasteAt = Date.now();
    lastMiddlePasteTarget = pasteTarget;
    pasteTarget.focus({ preventScroll: true });

    const overwrite = core.shouldOverwriteOnPaste(settings);

    if (core.shouldTryNativePasteCommand(pasteTarget) && pasteDirectlyIntoTarget(pasteTarget, overwrite)) {
      return;
    }

    const text = await readClipboardText();
    if (!text) {
      return;
    }

    insertTextAtTarget(pasteTarget, text, overwrite);
  }

  function showOptionalToast(message, event) {
    if (!message) {
      return;
    }

    showToast(message, event);
  }

  function pasteDirectlyIntoTarget(target, overwrite) {
    target.focus({ preventScroll: true });

    if (overwrite) {
      selectAllInTarget(target);
    }

    try {
      if (document.execCommand("paste")) {
        dispatchSyntheticInput(target, null);
        return true;
      }
    } catch (_) {
      return false;
    }

    return false;
  }

  function selectAllInTarget(target) {
    if (core.isTextInputElement(target)) {
      const length = typeof target.value === "string" ? target.value.length : 0;

      try {
        target.setSelectionRange(0, length);
      } catch (_) {
        if (typeof target.select === "function") {
          target.select();
        }
      }

      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function stopMiddleClickEvent(event) {
    event.preventDefault();
    event.stopPropagation();

    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }
  }

  async function readClipboardText() {
    try {
      if (
        navigator.clipboard &&
        navigator.clipboard.readText &&
        isClipboardFeatureAllowed("clipboard-read")
      ) {
        return await navigator.clipboard.readText();
      }
    } catch (_) {
      // Content-script clipboard reads can fail on some pages. Ask the extension page.
    }

    const pastedText = readClipboardTextWithPasteCommand();
    if (pastedText) {
      return pastedText;
    }

    const response = await sendRuntimeMessage({ type: READ_CLIPBOARD_MESSAGE });
    return response && response.ok ? response.text || "" : "";
  }

  function readClipboardTextWithPasteCommand() {
    const activeElement = document.activeElement;
    const proxy = document.createElement("textarea");

    Object.assign(proxy.style, {
      position: "fixed",
      left: "-9999px",
      top: "0",
      width: "1px",
      height: "1px",
      opacity: "0",
      pointerEvents: "none",
    });

    proxy.setAttribute("aria-hidden", "true");
    document.documentElement.appendChild(proxy);
    proxy.focus();

    try {
      if (!document.execCommand("paste")) {
        return "";
      }

      return proxy.value || proxy.textContent || "";
    } catch (_) {
      return "";
    } finally {
      proxy.remove();

      if (activeElement && typeof activeElement.focus === "function") {
        activeElement.focus({ preventScroll: true });
      }
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

  function getEditableInsertionTarget(target) {
    if (core.isTextInputElement(target)) {
      return target;
    }

    if (core.isContentEditableElement(target)) {
      return getContentEditableHost(target);
    }

    return null;
  }

  function getContentEditableHost(target) {
    if (target && typeof target.closest === "function") {
      return (
        target.closest("[contenteditable=''],[contenteditable='true'],[contenteditable='plaintext-only']") ||
        target
      );
    }

    return target;
  }

  function insertTextAtTarget(target, text, overwrite) {
    target.focus({ preventScroll: true });

    if (overwrite) {
      selectAllInTarget(target);
    }

    if (core.isTextInputElement(target)) {
      insertIntoTextInput(target, text);
      return;
    }

    insertIntoContentEditable(target, text);
  }

  function insertIntoTextInput(target, text) {
    const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
    const end = typeof target.selectionEnd === "number" ? target.selectionEnd : start;

    if (document.execCommand("insertText", false, text)) {
      return;
    }

    target.setRangeText(text, start, end, "end");
    dispatchSyntheticInput(target, text);
  }

  function insertIntoContentEditable(target, text) {
    if (document.execCommand("insertText", false, text)) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      target.appendChild(document.createTextNode(text));
      return;
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    dispatchSyntheticInput(target, text);
  }

  function dispatchSyntheticInput(target, text) {
    target.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: false,
        data: text,
        inputType: "insertText",
      }),
    );
  }

  function showToast(message, event) {
    if (toastElement) {
      toastElement.remove();
      toastElement = null;
    }

    clearTimeout(toastTimer);

    const toast = document.createElement("div");
    toast.textContent = message;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    const hasPointerPosition = typeof event.clientX === "number" && typeof event.clientY === "number";
    const left = hasPointerPosition
      ? Math.min(Math.max(event.clientX + 12, 8), window.innerWidth - 72)
      : Math.max(window.innerWidth - 84, 8);
    const top = hasPointerPosition
      ? Math.min(Math.max(event.clientY + 12, 8), window.innerHeight - 36)
      : 16;

    Object.assign(toast.style, {
      all: "initial",
      position: "fixed",
      zIndex: "2147483647",
      left: `${left}px`,
      top: `${top}px`,
      padding: "4px 8px",
      borderRadius: "6px",
      background: "rgba(24, 24, 27, 0.92)",
      color: "#fff",
      font: "12px/1.4 Arial, sans-serif",
      boxShadow: "0 4px 14px rgba(0, 0, 0, 0.18)",
      pointerEvents: "none",
      opacity: "0",
      transform: "translateY(2px)",
      transition: "opacity 120ms ease, transform 120ms ease",
    });

    document.documentElement.appendChild(toast);
    toastElement = toast;

    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    toastTimer = window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(2px)";
      window.setTimeout(() => toast.remove(), 140);
    }, 760);
  }
})();
