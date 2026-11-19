import { markTabSignedOut } from "@hanabi-live/data";
import { afterEach, expect, test, vi } from "vitest";
import { store } from "../store.ts";

vi.mock("../websocketInit.ts", () => ({ websocketInit: vi.fn() }));
const { automaticLogin } = await import("./login.ts");
const { websocketInit } = await import("../websocketInit.ts");

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => {
      items.clear();
    },
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a tab that signed out shows the sign-in screen once, not another tab's account", () => {
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("location", new URL("http://localhost/"));

  markTabSignedOut();
  automaticLogin();

  expect(websocketInit).not.toHaveBeenCalled();
  expect(store.getState().login.stage).toBe("signIn");

  // A reload after that connects with the saved session again.
  automaticLogin();
  expect(websocketInit).toHaveBeenCalledTimes(1);
});
