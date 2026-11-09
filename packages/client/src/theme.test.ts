import { beforeEach, describe, expect, test, vi } from "vitest";
import { LocalStorageStub } from "./testLocalStorage";
import { takeLegacyDarkMode } from "./theme";

const LEGACY_STORAGE_KEY = "darkMode";

// The test environment is Node, which has no "localStorage" or "matchMedia", so install minimal
// stand-ins.
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

describe("takeLegacyDarkMode", () => {
  beforeEach(() => {
    localStorageStub.clear();
    matchMediaMock.matches = false;
    vi.restoreAllMocks();
  });

  test("returns false when nothing is stored", () => {
    expect(takeLegacyDarkMode()).toBe(false);
  });

  test("returns the stored choice and removes it", () => {
    localStorageStub.setItem(LEGACY_STORAGE_KEY, "true");
    expect(takeLegacyDarkMode()).toBe(true);
    expect(localStorageStub.getItem(LEGACY_STORAGE_KEY)).toBeNull();

    localStorageStub.setItem(LEGACY_STORAGE_KEY, "false");
    matchMediaMock.matches = true;
    expect(takeLegacyDarkMode()).toBe(false);
    expect(localStorageStub.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  test('resolves "system" with the system preference', () => {
    localStorageStub.setItem(LEGACY_STORAGE_KEY, "system");
    matchMediaMock.matches = true;
    expect(takeLegacyDarkMode()).toBe(true);

    localStorageStub.setItem(LEGACY_STORAGE_KEY, "system");
    matchMediaMock.matches = false;
    expect(takeLegacyDarkMode()).toBe(false);
  });

  test("returns false when localStorage throws", () => {
    vi.spyOn(localStorageStub, "getItem").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(takeLegacyDarkMode()).toBe(false);
  });
});
