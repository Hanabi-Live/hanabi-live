import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { JSDOM } from "jsdom";

const dom = new JSDOM(`<!doctype html><body>
  <div id="page-cover"></div>
  <div id="modals-container">
    <div id="warning-modal" class="hidden">
      <p id="warning-modal-description"></p>
      <button id="warning-modal-button"></button>
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
    <button id="create-game-submit"></button>
    <input id="createTablePassword" />
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

await mock.module("./Globals", () => ({
  globals: { errorOccurred: false, lastActiveElement: null },
}));
await mock.module("./game/reducers/noteIdentity", () => ({}));
await mock.module("./game/ui/HanabiCardClick", () => ({
  morphReplayFromModal: mock(),
}));
await mock.module("./lobby/nav", () => ({ show: mock() }));

async function wait(milliseconds: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

// This must run before the error test, whose error modal cannot be closed.
test("the idle warning counts down and only lets players keep the game going", async () => {
  const modals = await import("./modals");
  const { document } = dom.window;
  const idleModal = document.querySelector("#idle-modal");
  const keep = document.querySelector<HTMLElement>("#idle-modal-keep");

  modals.showIdleWarning(299_000, null);
  await wait(150);
  expect(idleModal?.parentElement?.id).toBe("page-cover");
  expect(
    document.querySelector("#idle-modal-description strong")?.textContent,
  ).toBe("4:59");
  expect(keep?.style.display).toBe("none");

  let keepPlayingCalls = 0;
  modals.showIdleWarning(299_000, () => {
    keepPlayingCalls++;
  });
  await wait(150);
  expect(keep?.style.display).toBe("");
  keep?.onpointerdown?.(
    new dom.window.Event("pointerdown") as unknown as PointerEvent,
  );
  expect(keepPlayingCalls).toBe(1);
  expect(idleModal?.parentElement?.id).toBe("modals-container");
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
