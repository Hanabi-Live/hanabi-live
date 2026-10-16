import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { setBrowserAddressBarPath } from "./utils";

describe("setBrowserAddressBarPath", () => {
  const originalLocation = Object.getOwnPropertyDescriptor(
    globalThis,
    "location",
  );
  const originalHistory = Object.getOwnPropertyDescriptor(
    globalThis,
    "history",
  );

  afterEach(() => {
    if (originalLocation === undefined) {
      Reflect.deleteProperty(globalThis, "location");
    } else {
      Object.defineProperty(globalThis, "location", originalLocation);
    }
    if (originalHistory === undefined) {
      Reflect.deleteProperty(globalThis, "history");
    } else {
      Object.defineProperty(globalThis, "history", originalHistory);
    }
  });

  test("pushes a lobby-to-pregame transition", () => {
    const pushState = jest.fn();
    const replaceState = jest.fn();
    Object.defineProperties(globalThis, {
      location: {
        configurable: true,
        value: new URL("https://hanab.live/lobby?dev"),
      },
      history: {
        configurable: true,
        value: { pushState, replaceState },
      },
    });

    setBrowserAddressBarPath("/pre-game/123", undefined, "push");

    expect(pushState).toHaveBeenCalledWith(undefined, "", "/pre-game/123?dev");
    expect(replaceState).not.toHaveBeenCalled();
  });

  test("replaces an existing URL instead of duplicating a history entry", () => {
    const pushState = jest.fn();
    const replaceState = jest.fn();
    Object.defineProperties(globalThis, {
      location: {
        configurable: true,
        value: new URL("https://hanab.live/pre-game/123"),
      },
      history: {
        configurable: true,
        value: { pushState, replaceState },
      },
    });

    setBrowserAddressBarPath("/pre-game/123", undefined, "push");

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(undefined, "", "/pre-game/123");
  });

  test("turn-number updates keep replacing the active entry", () => {
    const pushState = jest.fn();
    const replaceState = jest.fn();
    Object.defineProperties(globalThis, {
      location: {
        configurable: true,
        value: new URL("https://hanab.live/replay/123#1"),
      },
      history: {
        configurable: true,
        value: { pushState, replaceState },
      },
    });

    setBrowserAddressBarPath("/replay/123", "#2");

    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).toHaveBeenCalledWith(undefined, "", "/replay/123#2");
  });
});
