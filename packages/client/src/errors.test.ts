import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { initErrorListener } from "./errors";
import { showError } from "./modals";

jest.mock("./modals", () => ({ showError: jest.fn() }));

type ErrorListener = (
  type: string,
  listener: (event: ErrorEvent) => void,
) => void;

describe("error reporting", () => {
  const previousAddEventListener = Object.getOwnPropertyDescriptor(
    globalThis,
    "addEventListener",
  );
  const previousNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );

  afterEach(() => {
    if (previousAddEventListener === undefined) {
      Reflect.deleteProperty(globalThis, "addEventListener");
    } else {
      Object.defineProperty(
        globalThis,
        "addEventListener",
        previousAddEventListener,
      );
    }
    if (previousNavigator === undefined) {
      Reflect.deleteProperty(globalThis, "navigator");
    } else {
      Object.defineProperty(globalThis, "navigator", previousNavigator);
    }
    jest.clearAllMocks();
  });

  test("report links open in new tabs without discarding the stack", () => {
    const addEventListener = jest.fn<ErrorListener>();
    Object.defineProperties(globalThis, {
      addEventListener: {
        configurable: true,
        value: addEventListener,
      },
      navigator: {
        configurable: true,
        value: { userAgent: "Mozilla/5.0", platform: "Linux" },
      },
    });

    initErrorListener();
    const listener = addEventListener.mock.calls[0]?.[1];
    expect(listener).toBeDefined();
    listener?.({
      lineno: 12,
      colno: 4,
      filename: "https://hanab.live/main.min.js",
      message: "Test error",
      error: { stack: String.raw`Test error\n  at stackTraceLocation` },
    } as ErrorEvent);

    const renderedError = jest.mocked(showError).mock.calls[0]?.[0];
    expect(renderedError).toContain("stackTraceLocation");
    expect(renderedError).toContain(
      '<a href="https://github.com/Hanabi-Live/hanabi-live" target="_blank" rel="noopener noreferrer">',
    );
    expect(renderedError).toContain(
      '<a href="https://discord.gg/FADvkJp" target="_blank" rel="noopener noreferrer">',
    );
  });
});
