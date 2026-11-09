import { JSDOM } from "jsdom";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

const dom = new JSDOM(`<!doctype html><body>
  <div id="page-cover"></div>
  <div id="modals-container">
    <div id="warning-modal" class="hidden">
      <p id="warning-modal-description"></p>
      <button id="warning-modal-button"></button>
    </div>
    <div id="confirm-modal" class="hidden">
      <h3 id="confirm-modal-title"></h3>
      <p id="confirm-modal-description"></p>
      <button id="confirm-modal-confirm"></button>
      <button id="confirm-modal-cancel"></button>
    </div>
    <div id="error-modal" class="hidden">
      <p id="error-modal-description"></p>
      <button id="error-modal-button"></button>
    </div>
    <div id="idle-modal" class="hidden">
      <p id="idle-modal-description"></p>
      <button id="idle-modal-keep"></button>
      <button id="idle-modal-close"></button>
    </div>
    <button id="morph-modal-button-cancel"></button>
    <button id="morph-modal-button-ok"></button>
    <p id="morph-modal-description"></p>
    <input id="morph-modal-textbox" />
    <button id="password-modal-cancel"></button>
    <input id="password-modal-id" />
    <input id="password-modal-password" />
    <button id="password-modal-submit"></button>
  </div>
</body>`);
const domGlobals = {
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  MutationObserver: dom.window.MutationObserver,
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

vi.mock("./Globals", () => ({
  globals: { errorOccurred: false, lastActiveElement: null },
}));
vi.mock("./game/reducers/noteIdentity", () => ({}));
vi.mock("./game/ui/HanabiCardClick", () => ({
  morphReplayFromModal: vi.fn(),
}));
vi.mock("./lobby/nav", () => ({ show: vi.fn() }));

/** Long enough for a modal to finish opening or closing. */
const MODAL_WAIT_MILLISECONDS = 150;

async function waitForModal() {
  await new Promise((resolve) => {
    setTimeout(resolve, MODAL_WAIT_MILLISECONDS);
  });
}

// This must run before the error test, whose error modal cannot be closed.
test("the idle warning counts down and only lets players keep the game going", async () => {
  const modals = await import("./modals");
  const { document } = dom.window;
  const idleModal = document.querySelector("#idle-modal");
  const keep = document.querySelector<HTMLElement>("#idle-modal-keep");

  modals.showIdleWarning(299_000, null);
  await waitForModal();
  expect(idleModal?.parentElement?.id).toBe("page-cover");
  expect(
    document.querySelector("#idle-modal-description strong")?.textContent,
  ).toBe("4:59");
  expect(keep?.style.display).toBe("none");

  let keepPlayingCalls = 0;
  modals.showIdleWarning(299_000, () => {
    keepPlayingCalls++;
  });
  await waitForModal();
  expect(keep?.style.display).toBe("");
  keep?.onpointerdown?.(
    new dom.window.Event("pointerdown") as unknown as PointerEvent,
  );
  expect(keepPlayingCalls).toBe(1);
  expect(idleModal?.parentElement?.id).toBe("modals-container");
});

test("a confirmation runs exactly one of its callbacks", async () => {
  const modals = await import("./modals");
  modals.init();
  const { document } = dom.window;
  const pageCover = document.querySelector<HTMLElement>("#page-cover")!;

  const onConfirm = vi.fn<() => void>();
  const onCancel = vi.fn<() => void>();
  modals.askForConfirmation("Title", "Description", "OK", onConfirm, onCancel);
  await waitForModal();
  document.querySelector<HTMLElement>("#confirm-modal-confirm")!.click();
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
  await waitForModal();
  expect(pageCover.style.display).toBe("flex");

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
  const modals = await import("./modals");
  modals.showError("The connection was rejected.");
  // The "warning" command opens its modal after a delay, so it can arrive after an error.
  modals.showWarning("A late warning.");
  await new Promise((resolve) => {
    setTimeout(resolve, 150);
  });
  const { document } = dom.window;
  expect(document.querySelector("#error-modal")?.parentElement?.id).toBe(
    "page-cover",
  );
  expect(
    document.querySelector("#error-modal")?.classList.contains("hidden"),
  ).toBe(false);
  expect(document.querySelector("#warning-modal")?.parentElement?.id).toBe(
    "modals-container",
  );
  modals.closeModals();
  expect(document.querySelector("#error-modal")?.parentElement?.id).toBe(
    "page-cover",
  );
});
