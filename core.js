(function initAutoCopyCore(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.AutoCopyCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAutoCopyCore() {
  const DEFAULT_SETTINGS = Object.freeze({
    autoCopyPageSelection: true,
    editableCtrlCopy: true,
    middleClickPaste: true,
    middleClickPasteOverwrite: true,
  });

  const NON_TEXT_INPUT_TYPES = new Set([
    "button",
    "checkbox",
    "color",
    "date",
    "datetime-local",
    "file",
    "hidden",
    "image",
    "month",
    "radio",
    "range",
    "reset",
    "submit",
    "time",
    "week",
  ]);

  function normalizeCopyText(text) {
    return String(text ?? "").trim();
  }

  function getElementTarget(target) {
    if (!target) {
      return null;
    }

    if (target.nodeType === 3 && target.parentElement) {
      return target.parentElement;
    }

    if (target.nodeType === 1 || target.tagName || target.isContentEditable) {
      return target;
    }

    return null;
  }

  function isTextInputElement(target) {
    const element = getElementTarget(target);

    if (!element) {
      return false;
    }

    const tagName = String(element.tagName || "").toUpperCase();

    if (tagName === "TEXTAREA") {
      return !element.disabled && !element.readOnly;
    }

    if (tagName !== "INPUT") {
      return false;
    }

    const type = String(element.type || "text").toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type) && !element.disabled && !element.readOnly;
  }

  function isContentEditableElement(target) {
    const element = getElementTarget(target);

    if (!element) {
      return false;
    }

    if (element.isContentEditable) {
      return true;
    }

    if (typeof element.closest !== "function") {
      return false;
    }

    return Boolean(
      element.closest("[contenteditable=''],[contenteditable='true'],[contenteditable='plaintext-only']"),
    );
  }

  function isEditableTarget(target) {
    return isTextInputElement(target) || isContentEditableElement(target);
  }

  function resolveSettings(settings) {
    return {
      ...DEFAULT_SETTINGS,
      ...(settings || {}),
    };
  }

  function shouldCopySelection({ text, editable, ctrlKey, settings }) {
    const resolved = resolveSettings(settings);

    if (!normalizeCopyText(text)) {
      return false;
    }

    if (editable) {
      return Boolean(resolved.editableCtrlCopy && ctrlKey);
    }

    return Boolean(resolved.autoCopyPageSelection);
  }

  function resolveSelectionEditableState({
    eventTargetEditable,
    activeTextInputHasSelection,
    selectionRangeEditable,
  }) {
    return Boolean(eventTargetEditable || activeTextInputHasSelection || selectionRangeEditable);
  }

  function shouldPasteOnMiddleClick({ button, editable, middleClickPaste }) {
    return button === 1 && Boolean(editable && middleClickPaste);
  }

  function shouldHandleMiddlePasteEvent({ type, button, editable, middleClickPaste }) {
    if (type !== "mousedown" && type !== "auxclick") {
      return false;
    }

    return shouldPasteOnMiddleClick({ button, editable, middleClickPaste });
  }

  function shouldOverwriteOnPaste(settings) {
    return Boolean(resolveSettings(settings).middleClickPasteOverwrite);
  }

  function shouldTryNativePasteCommand(target) {
    // Plain form fields handle execCommand("paste") reliably. Rich
    // contenteditable editors (Slate/ProseMirror/etc.) often hijack the paste
    // event and silently drop an extension-initiated paste while execCommand
    // still reports success, so skip the shortcut and use the clipboard
    // read + insertText path for them instead.
    return isTextInputElement(target);
  }

  function getClipboardReadStrategyOrder() {
    return ["navigatorClipboard", "execCommandPaste", "runtimeMessage"];
  }

  function getMiddlePasteStrategyOrder() {
    return ["nativePasteCommand", "clipboardReadAndInsert"];
  }

  function getToastMessage(type) {
    if (type === "copySuccess") {
      return "copied";
    }

    return "";
  }

  return {
    DEFAULT_SETTINGS,
    normalizeCopyText,
    isTextInputElement,
    isContentEditableElement,
    isEditableTarget,
    resolveSettings,
    shouldCopySelection,
    resolveSelectionEditableState,
    shouldPasteOnMiddleClick,
    shouldHandleMiddlePasteEvent,
    shouldOverwriteOnPaste,
    shouldTryNativePasteCommand,
    getClipboardReadStrategyOrder,
    getMiddlePasteStrategyOrder,
    getToastMessage,
  };
});
