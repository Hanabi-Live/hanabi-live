import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { LocalStorageStub } from "./testLocalStorage";
import { getStoredPreference, isDarkMode } from "./theme";

const STORAGE_KEY = "darkMode";

// The jest environment is Node, which has no "localStorage" or "window"; theme.ts is defensive
// around their absence, but we want to exercise the "value is stored" and "system preference"
// paths, so install minimal stand-ins.
const localStorageStub = new LocalStorageStub();
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageStub,
  configurable: true,
  writable: true,
});

const matchMediaMock = ((query: string): MediaQueryList =>
  ({ matches: matchMediaMock.matches, media: query }) as MediaQueryList) as ((
  query: string,
) => MediaQueryList) & { matches: boolean };

Object.defineProperty(globalThis, "matchMedia", {
  value: matchMediaMock,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, "window", {
  value: { matchMedia: matchMediaMock },
  configurable: true,
  writable: true,
});

describe("theme", () => {
  beforeEach(() => {
    localStorageStub.clear();
    matchMediaMock.matches = false;
    jest.restoreAllMocks();
  });

  describe("getStoredPreference", () => {
    test("returns null when nothing is stored", () => {
      expect(getStoredPreference()).toBeNull();
    });

    test('returns true when "true" is stored', () => {
      localStorageStub.setItem(STORAGE_KEY, "true");
      expect(getStoredPreference()).toBe(true);
    });

    test('returns false when "false" is stored', () => {
      localStorageStub.setItem(STORAGE_KEY, "false");
      expect(getStoredPreference()).toBe(false);
    });

    test("returns null for an invalid stored value", () => {
      localStorageStub.setItem(STORAGE_KEY, "yes");
      expect(getStoredPreference()).toBeNull();
    });

    test("returns null when localStorage throws", () => {
      jest.spyOn(localStorageStub, "getItem").mockImplementation(() => {
        throw new Error("unavailable");
      });
      expect(getStoredPreference()).toBeNull();
    });
  });

  describe("isDarkMode", () => {
    test("returns the stored preference when set", () => {
      localStorageStub.setItem(STORAGE_KEY, "false");
      expect(isDarkMode()).toBe(false);

      localStorageStub.setItem(STORAGE_KEY, "true");
      expect(isDarkMode()).toBe(true);
    });

    test("follows the system preference when nothing is stored", () => {
      matchMediaMock.matches = true;
      expect(isDarkMode()).toBe(true);

      matchMediaMock.matches = false;
      expect(isDarkMode()).toBe(false);
    });

    test("the stored preference wins over the system preference", () => {
      localStorageStub.setItem(STORAGE_KEY, "false");
      matchMediaMock.matches = true;
      expect(isDarkMode()).toBe(false);
    });
  });
});
