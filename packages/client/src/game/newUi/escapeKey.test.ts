// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let modalVisible = false;
vi.mock("../../modals.ts", () => ({
  isModalVisible: () => modalVisible,
}));
const { onEscapeKey } = await import("./escapeKey.ts");

/** Stands for the hotkeys of "ui/keyboard.ts", which listen on the document. */
const gameHotkey = vi.fn<(event: KeyboardEvent) => void>();

function pressEscape() {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
    }),
  );
}

describe("onEscapeKey", () => {
  beforeEach(() => {
    modalVisible = false;
    gameHotkey.mockClear();
    document.addEventListener("keydown", gameHotkey);
  });

  afterEach(() => {
    document.removeEventListener("keydown", gameHotkey);
  });

  test("closes the menu without the game's Escape hotkey", () => {
    const close = vi.fn<() => void>();
    const stop = onEscapeKey(close);

    pressEscape();

    expect(close).toHaveBeenCalledOnce();
    expect(gameHotkey).not.toHaveBeenCalled();
    stop();
  });

  test("leaves Escape to the game once the menu has closed", () => {
    const close = vi.fn<() => void>();
    onEscapeKey(close)();

    pressEscape();

    expect(close).not.toHaveBeenCalled();
    expect(gameHotkey).toHaveBeenCalledOnce();
  });

  test("leaves Escape to the game while it does not apply", () => {
    const close = vi.fn<() => void>();
    const stop = onEscapeKey(close, () => false);

    pressEscape();

    expect(close).not.toHaveBeenCalled();
    expect(gameHotkey).toHaveBeenCalledOnce();
    stop();
  });

  test("closes only the layer that opened last", () => {
    const closeFirst = vi.fn<() => void>();
    const closeSecond = vi.fn<() => void>();
    const stopFirst = onEscapeKey(closeFirst);
    const stopSecond = onEscapeKey(closeSecond);

    pressEscape();

    expect(closeSecond).toHaveBeenCalledOnce();
    expect(closeFirst).not.toHaveBeenCalled();
    expect(gameHotkey).not.toHaveBeenCalled();

    stopSecond();
    pressEscape();

    expect(closeFirst).toHaveBeenCalledOnce();
    stopFirst();
  });

  test("leaves Escape to a text box that the player types in", () => {
    const close = vi.fn<() => void>();
    const stop = onEscapeKey(close);
    const input = document.createElement("input");
    document.body.append(input);

    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
      }),
    );

    expect(close).not.toHaveBeenCalled();
    expect(gameHotkey).toHaveBeenCalledOnce();
    input.remove();
    stop();
  });

  test("leaves Escape to a modal that shows", () => {
    modalVisible = true;
    const close = vi.fn<() => void>();
    const stop = onEscapeKey(close);

    pressEscape();

    expect(close).not.toHaveBeenCalled();
    expect(gameHotkey).toHaveBeenCalledOnce();
    stop();
  });
});
