import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { initErrorListener } from "./errors";
import { showError } from "./modals";

jest.mock("./modals", () => ({ showError: jest.fn() }));

describe("error reporting", () => {
  const addEventListenerDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "addEventListener",
  );
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );

  afterEach(() => {
    for (const [key, descriptor] of [
      ["addEventListener", addEventListenerDescriptor],
      ["navigator", navigatorDescriptor],
    ] as const) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, key);
      } else {
        Object.defineProperty(globalThis, key, descriptor);
      }
    }
    jest.clearAllMocks();
  });

  test("keeps the error page available when following report links", () => {
    const addEventListener = jest.fn<
      (type: string, listener: (event: ErrorEvent) => void) => void
    >();
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
      error: { stack: "Test error\\n  at stackTraceLocation" },
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
