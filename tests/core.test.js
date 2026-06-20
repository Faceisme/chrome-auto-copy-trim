const assert = require("node:assert/strict");
const test = require("node:test");

const core = require("../core.js");

test("normalizeCopyText trims surrounding whitespace and newlines", () => {
  assert.equal(core.normalizeCopyText("\n\t  hello world  \r\n"), "hello world");
});

test("normalizeCopyText returns an empty string for whitespace-only input", () => {
  assert.equal(core.normalizeCopyText(" \n\t\r "), "");
});

test("isEditableTarget detects input, textarea, and contenteditable targets", () => {
  assert.equal(core.isEditableTarget({ tagName: "INPUT" }), true);
  assert.equal(core.isEditableTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(core.isEditableTarget({ isContentEditable: true, tagName: "DIV" }), true);
  assert.equal(core.isEditableTarget({ tagName: "DIV" }), false);
});

test("shouldCopySelection allows normal page auto-copy without ctrl when enabled", () => {
  assert.equal(
    core.shouldCopySelection({
      text: "plain text",
      editable: false,
      ctrlKey: false,
      settings: {
        autoCopyPageSelection: true,
        editableCtrlCopy: true,
      },
    }),
    true,
  );
});

test("shouldCopySelection requires ctrl inside editable targets when configured", () => {
  const base = {
    text: "field text",
    editable: true,
    settings: {
      autoCopyPageSelection: true,
      editableCtrlCopy: true,
    },
  };

  assert.equal(core.shouldCopySelection({ ...base, ctrlKey: false }), false);
  assert.equal(core.shouldCopySelection({ ...base, ctrlKey: true }), true);
});

test("shouldCopySelection does not auto-copy editable text without ctrl when event target is non-editable", () => {
  assert.equal(
    core.shouldCopySelection({
      text: "google query",
      editable: core.resolveSelectionEditableState({
        eventTargetEditable: false,
        activeTextInputHasSelection: true,
        selectionRangeEditable: false,
      }),
      ctrlKey: false,
      settings: {
        autoCopyPageSelection: true,
        editableCtrlCopy: true,
      },
    }),
    false,
  );
});

test("resolveSelectionEditableState treats active input selection as editable", () => {
  assert.equal(
    core.resolveSelectionEditableState({
      eventTargetEditable: false,
      activeTextInputHasSelection: true,
      selectionRangeEditable: false,
    }),
    true,
  );
});

test("shouldCopySelection can disable editable ctrl-copy", () => {
  assert.equal(
    core.shouldCopySelection({
      text: "field text",
      editable: true,
      ctrlKey: true,
      settings: {
        autoCopyPageSelection: true,
        editableCtrlCopy: false,
      },
    }),
    false,
  );
});

test("shouldPasteOnMiddleClick only allows editable targets when enabled", () => {
  assert.equal(
    core.shouldPasteOnMiddleClick({
      button: 1,
      editable: true,
      middleClickPaste: true,
    }),
    true,
  );
  assert.equal(
    core.shouldPasteOnMiddleClick({
      button: 1,
      editable: false,
      middleClickPaste: true,
    }),
    false,
  );
  assert.equal(
    core.shouldPasteOnMiddleClick({
      button: 0,
      editable: true,
      middleClickPaste: true,
    }),
    false,
  );
});

test("default settings enable middle-click paste", () => {
  assert.equal(core.DEFAULT_SETTINGS.middleClickPaste, true);
});

test("default settings overwrite the target content on middle-click paste", () => {
  assert.equal(core.DEFAULT_SETTINGS.middleClickPasteOverwrite, true);
});

test("shouldOverwriteOnPaste reflects the configured setting and defaults to overwrite", () => {
  assert.equal(core.shouldOverwriteOnPaste(), true);
  assert.equal(core.shouldOverwriteOnPaste({}), true);
  assert.equal(core.shouldOverwriteOnPaste({ middleClickPasteOverwrite: true }), true);
  assert.equal(core.shouldOverwriteOnPaste({ middleClickPasteOverwrite: false }), false);
});

test("clipboard read strategy tries content-script APIs before background fallback", () => {
  assert.deepEqual(core.getClipboardReadStrategyOrder(), [
    "navigatorClipboard",
    "execCommandPaste",
    "runtimeMessage",
  ]);
});

test("middle-click paste tries native paste before manual clipboard insertion", () => {
  assert.deepEqual(core.getMiddlePasteStrategyOrder(), [
    "nativePasteCommand",
    "clipboardReadAndInsert",
  ]);
});

test("toast text uses copied for successful copy", () => {
  assert.equal(core.getToastMessage("copySuccess"), "copied");
});

test("toast text is empty for paste results", () => {
  assert.equal(core.getToastMessage("pasteSuccess"), "");
  assert.equal(core.getToastMessage("pasteFailure"), "");
});

test("shouldPasteOnMiddleClick accepts middle-button mousedown before browser defaults run", () => {
  assert.equal(
    core.shouldHandleMiddlePasteEvent({
      type: "mousedown",
      button: 1,
      editable: true,
      middleClickPaste: true,
    }),
    true,
  );

  assert.equal(
    core.shouldHandleMiddlePasteEvent({
      type: "mouseup",
      button: 1,
      editable: true,
      middleClickPaste: true,
    }),
    false,
  );
});
