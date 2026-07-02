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

test("resolveSelectionEditableState treats a form-scoped selection as editable", () => {
  assert.equal(
    core.resolveSelectionEditableState({
      eventTargetEditable: false,
      activeTextInputHasSelection: false,
      selectionRangeEditable: false,
      selectionWithinFormScope: true,
    }),
    true,
  );
});

test("isWithinFormFieldScope treats chrome inside a text-field form as editable", () => {
  const form = { querySelectorAll: () => [{ tagName: "INPUT", type: "text" }] };
  const searchLabel = {
    tagName: "A",
    closest: (selector) => (selector === "form" ? form : null),
  };
  assert.equal(core.isWithinFormFieldScope(searchLabel), true);
});

test("isWithinFormFieldScope treats a role=search region as editable", () => {
  const region = {
    tagName: "SPAN",
    closest: (selector) => (selector === "[role='search']" ? { tagName: "DIV" } : null),
  };
  assert.equal(core.isWithinFormFieldScope(region), true);
});

test("isWithinFormFieldScope ignores forms without a text field", () => {
  const form = {
    querySelectorAll: () => [{ tagName: "INPUT", type: "checkbox" }, { tagName: "BUTTON" }],
  };
  const label = {
    tagName: "SPAN",
    closest: (selector) => (selector === "form" ? form : null),
  };
  assert.equal(core.isWithinFormFieldScope(label), false);
});

test("isWithinFormFieldScope leaves plain page content copyable", () => {
  const cell = { tagName: "TD", closest: () => null };
  assert.equal(core.isWithinFormFieldScope(cell), false);
});

test("shouldCopySelection suppresses input text that leaked into a page selection", () => {
  // Right-to-left overshoot past a field's edge: window.getSelection() reports
  // the field's own value, but the range still resolves inside the search form.
  const form = { querySelectorAll: () => [{ tagName: "INPUT", type: "text" }] };
  const wrapperInsideForm = {
    tagName: "DIV",
    closest: (selector) => (selector === "form" ? form : null),
  };

  const editable = core.resolveSelectionEditableState({
    eventTargetEditable: false,
    activeTextInputHasSelection: false,
    selectionRangeEditable: false,
    selectionWithinFormScope: core.isWithinFormFieldScope(wrapperInsideForm),
  });

  assert.equal(editable, true);
  assert.equal(
    core.shouldCopySelection({
      text: "OLDTEXT_IN_BOX",
      editable,
      ctrlKey: false,
      settings: { autoCopyPageSelection: true, editableCtrlCopy: true },
    }),
    false,
  );
});

test("shouldCopySelection skips search-bar labels next to a text field", () => {
  // Reproduces the forum search bar: a right-to-left sweep lands on the
  // "帖子" dropdown link, an <a> that lives in the same <form> as the search
  // input. It must be treated as editable so it is not auto-copied.
  const form = { querySelectorAll: () => [{ tagName: "INPUT", type: "text" }] };
  const searchLabel = {
    tagName: "A",
    closest: (selector) => (selector === "form" ? form : null),
  };

  const editable = core.resolveSelectionEditableState({
    eventTargetEditable: core.isEditableTarget(searchLabel),
    activeTextInputHasSelection: false,
    selectionRangeEditable: false,
    selectionWithinFormScope: core.isWithinFormFieldScope(searchLabel),
  });

  assert.equal(editable, true);
  assert.equal(
    core.shouldCopySelection({
      text: "帖子",
      editable,
      ctrlKey: false,
      settings: { autoCopyPageSelection: true, editableCtrlCopy: true },
    }),
    false,
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

test("shouldTryNativePasteCommand only trusts execCommand paste for plain form fields", () => {
  assert.equal(core.shouldTryNativePasteCommand({ tagName: "INPUT" }), true);
  assert.equal(core.shouldTryNativePasteCommand({ tagName: "TEXTAREA" }), true);
  assert.equal(
    core.shouldTryNativePasteCommand({ isContentEditable: true, tagName: "DIV" }),
    false,
  );
  assert.equal(core.shouldTryNativePasteCommand(null), false);
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
