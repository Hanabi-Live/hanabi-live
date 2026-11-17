import { SCRIPTS_PATH } from "@hanabi-live/data";
import { expect, test, vi } from "vitest";
import type { Connection } from "./Connection.ts";

vi.mock("./modals.ts", () => ({ showError: vi.fn() }));

// The test environment is Node, which has no window events, so install minimal stand-ins.
class FakeErrorEvent {
  readonly lineno = 1;
  readonly colno = 2;
  readonly filename = `https://hanab.live${SCRIPTS_PATH}main.abc.min.js`;
  readonly message: string;
  readonly error: unknown;

  constructor(message: string, error: unknown) {
    this.message = message;
    this.error = error;
  }
}
vi.stubGlobal("ErrorEvent", FakeErrorEvent);
/** Whether the page has a `<font>` element, which a translator adds. */
let translated = false;
vi.stubGlobal("document", {
  documentElement: {
    classList: {
      contains: () => false,
    },
  },
  querySelector: (selector: string) =>
    selector === "font" && translated ? {} : null,
});
const listeners = new Map<string, (event: unknown) => void>();
vi.stubGlobal(
  "addEventListener",
  (name: string, listener: (event: unknown) => void) => {
    listeners.set(name, listener);
  },
);

const { sendErrorReports, initErrorListener } = await import("./errors.ts");
initErrorListener();

/** An error whose stack trace has a call in `script`. */
function scriptError(
  message: string,
  script = `https://hanab.live${SCRIPTS_PATH}main.abc.min.js`,
): Error {
  const error = new Error(message);
  Object.defineProperty(error, "stack", {
    value: `Error: ${message}\n    at f (${script}:1:2)`,
  });
  return error;
}

function throwError(message: string, script?: string) {
  listeners.get("error")?.(
    new FakeErrorEvent(
      `Uncaught Error: ${message}`,
      scriptError(message, script),
    ),
  );
}

test("errors from the website's scripts are reported once each, up to a limit", () => {
  throwError("Before the connection");
  throwError("In an extension", "chrome-extension://abc/inject.js");
  listeners.get("unhandledrejection")?.({ reason: scriptError("Rejected") });
  // Chrome leaves out the message of some errors, such as a `DOMException`. A translator that
  // changes the page's text can cause them.
  const domError = scriptError("Not a child");
  domError.name = "NotFoundError";
  translated = true;
  listeners.get("error")?.(new FakeErrorEvent("Uncaught ", domError));
  translated = false;

  // The reports wait for the connection to open.
  const sent: unknown[] = [];
  const connection = {
    ws: {
      readyState: WebSocket.OPEN,
    },
    send: (command: string, data: { message: string; translated: boolean }) => {
      sent.push([command, data.message, data.translated]);
    },
  } as unknown as Connection;
  sendErrorReports(connection);
  expect(sent).toEqual([
    ["clientError", "Uncaught Error: Before the connection", false],
    ["clientError", "Unhandled rejection: Rejected", false],
    ["clientError", "Uncaught NotFoundError: Not a child", true],
  ]);

  throwError("Before the connection");
  for (let index = 0; index < 10; index++) {
    throwError(`Later ${index}`);
  }
  expect(sent).toHaveLength(5);
});
