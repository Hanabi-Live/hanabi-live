import { JSDOM } from "jsdom";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const dom = new JSDOM(`<!doctype html><body>
  <dialog id="modal-dialog"></dialog>
  <div id="modals-container">
    <div id="message-modal"></div>
    <div id="prompt-modal"></div>
  </div>
</body>`);
// The "jsdom" library does not open or close dialogs.
const { HTMLDialogElement } = dom.window;
HTMLDialogElement.prototype.showModal = function showModal(
  this: HTMLDialogElement,
) {
  this.open = true;
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  if (this.open) {
    this.open = false;
    this.dispatchEvent(new dom.window.Event("close"));
  }
};

const domGlobals = {
  document: dom.window.document,
  HTMLDialogElement,
  HTMLElement: dom.window.HTMLElement,
};
const savedGlobals = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  for (const [name, value] of Object.entries(domGlobals)) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
  }
});

afterAll(() => {
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, name);
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
});

vi.mock("./Globals.ts", () => ({
  globals: {
    errorOccurred: false,
    lastActiveElement: undefined,
  },
}));
vi.mock("./game/reducers/noteIdentity.ts", () => ({}));
vi.mock("./game/hypothetical.ts", () => ({ morphCard: vi.fn() }));

function getMessageModal() {
  return dom.window.document.querySelector("#message-modal");
}

// This must run before the error test, whose error modal cannot be closed.
test("the idle warning only lets players keep the game going", async () => {
  const modals = await import("./modals.ts");
  const { store } = await import("./store.ts");

  modals.showIdleWarning(299_000, undefined);
  expect(getMessageModal()?.parentElement?.id).toBe("modal-dialog");
  expect(store.getState().messageModal.modal).toMatchObject({
    type: "idle",
    canKeepPlaying: false,
  });

  const keepPlaying = vi.fn<() => void>();
  modals.showIdleWarning(299_000, keepPlaying);
  expect(store.getState().messageModal.modal).toMatchObject({
    canKeepPlaying: true,
  });
  modals.keepPlaying();
  expect(keepPlaying).toHaveBeenCalledTimes(1);
  expect(getMessageModal()?.parentElement?.id).toBe("modals-container");
  expect(store.getState().messageModal.modal).toBeUndefined();
});

test("a confirmation runs exactly one of its callbacks", async () => {
  const modals = await import("./modals.ts");
  modals.init();
  const { document } = dom.window;
  const modalDialog =
    document.querySelector<HTMLDialogElement>("#modal-dialog")!;

  const onConfirm = vi.fn<() => void>();
  const onCancel = vi.fn<() => void>();
  modals.askForConfirmation("Title", "Description", "OK", onConfirm, onCancel);
  modals.confirm();
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).not.toHaveBeenCalled();

  // Dismissing the modal in any way cancels, and a modal opened right after another one closes
  // stays visible.
  const onConfirm2 = vi.fn<() => void>();
  const onCancel2 = vi.fn<() => void>();
  modals.askForConfirmation(
    "Title",
    "Description",
    "OK",
    onConfirm2,
    onCancel2,
  );
  expect(modalDialog.open).toBe(true);

  // Escape closes the modal without also reaching the screen behind it.
  const screenKeydown = vi.fn<() => void>();
  document.addEventListener("keydown", screenKeydown);
  document.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Escape" }),
  );
  document.removeEventListener("keydown", screenKeydown);
  expect(screenKeydown).not.toHaveBeenCalled();
  expect(onConfirm2).not.toHaveBeenCalled();
  expect(onCancel2).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

test("a warning shown after an error does not replace the error modal", async () => {
  const modals = await import("./modals.ts");
  const { store } = await import("./store.ts");
  modals.showError("The connection was rejected.");
  // The "warning" command opens its modal after a delay, so it can arrive after an error.
  modals.showWarning("A late warning.");
  expect(store.getState().messageModal.modal?.type).toBe("error");
  modals.closeModals();
  expect(getMessageModal()?.parentElement?.id).toBe("modal-dialog");
  expect(store.getState().messageModal.modal?.type).toBe("error");
});
