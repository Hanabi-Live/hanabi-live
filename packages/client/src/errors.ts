import type { ClientRequestData } from "@hanabi-live/data";
import {
  MAX_CLIENT_ERROR_MESSAGE_LENGTH,
  MAX_CLIENT_ERROR_STACK_LENGTH,
  PROJECT_NAME,
  SCRIPTS_PATH,
} from "@hanabi-live/data";
import type { Connection } from "./Connection.ts";
import { showError } from "./modals.ts";
import { isTranslated } from "./translators.ts";
import { escapeHtml } from "./utils.ts";

/**
 * Where the Brave browser on iOS reports errors from code it injects: the character directly after
 * the opening `<!doctype HTML>` of each page.
 */
const INJECTED_ERROR_LOCATION = {
  lineno: 1,
  colno: 16,
} as const;

/**
 * The most calls that a stack trace names. Chrome names only 10 by default, which can leave out the
 * code that caused the error. The server cuts a stack trace that is too long.
 */
const STACK_TRACE_LIMIT = 50;

/** The most errors that a page reports to the server. */
const MAX_REPORTS = 5;

type ErrorReport = ClientRequestData["clientError"];

/** The errors that this page reported, as their message and stack trace. */
const reported = new Set<string>();

/** The reports that wait for the connection to open. */
const unsent: ErrorReport[] = [];

/** The connection that the reports go to. */
let reportConnection: Connection | undefined;

/**
 * Sends the error reports to a connection that just opened, and the next reports as they happen.
 */
export function sendErrorReports(connection: Connection): void {
  reportConnection = connection;
  for (const report of unsent.splice(0)) {
    connection.send("clientError", report);
  }
}

/**
 * Reports an error to the server, which alerts the developers. It skips an error that did not come
 * from the website's scripts, such as one in a browser extension.
 */
function reportError(message: string, stack: string | undefined) {
  if (stack?.includes(SCRIPTS_PATH) !== true) {
    return;
  }
  const key = `${message}\n${stack}`;
  if (reported.has(key) || reported.size >= MAX_REPORTS) {
    return;
  }
  reported.add(key);

  const report: ErrorReport = {
    message: truncate(message, MAX_CLIENT_ERROR_MESSAGE_LENGTH),
    stack: truncate(stack, MAX_CLIENT_ERROR_STACK_LENGTH),
    translated: isTranslated(),
  };
  if (reportConnection?.ws.readyState === WebSocket.OPEN) {
    reportConnection.send("clientError", report);
  } else {
    unsent.push(report);
  }
}

/**
 * The first characters of a text, without splitting a character in two. The server cuts a report
 * that is still too long.
 */
function truncate(text: string, maxLength: number): string {
  return [...new Intl.Segmenter().segment(text)]
    .slice(0, maxLength)
    .map(({ segment }) => segment)
    .join("");
}

/**
 * Initialize a global error handler that will show errors to the end-user and report them to the
 * server.
 */
export function initErrorListener(): void {
  // eslint-disable-next-line unicorn/no-nonstandard-builtin-properties -- Chromium is the only supported browser.
  Error.stackTraceLimit = STACK_TRACE_LIMIT;

  globalThis.addEventListener("error", (errorEvent) => {
    if (!(errorEvent instanceof ErrorEvent)) {
      return;
    }
    if (
      (errorEvent.lineno === 0
        && errorEvent.colno === 0
        && errorEvent.filename === ""
        && errorEvent.error === null)
      || (errorEvent.lineno === INJECTED_ERROR_LOCATION.lineno
        && errorEvent.colno === INJECTED_ERROR_LOCATION.colno
        && !errorEvent.filename.includes(SCRIPTS_PATH))
    ) {
      // Some buggy code that the browser injected is causing an error. Safe to ignore.
      return;
    }

    const errorStackTrace = getErrorStackTrace(errorEvent);
    reportError(getErrorMessage(errorEvent), errorStackTrace);
    const stackTrace = errorStackTrace ?? errorEvent.message;
    const formattedStackTrace = `<pre>${escapeHtml(stackTrace)}</pre>`;

    const reportInstructions = `
      In order to make the website better, please report this error along with steps that you did to
      cause it. You can report it:
      <ul>
        <li>in the lobby chat (worst option)</li>
        <li>or in <a href="https://discord.gg/FADvkJp" target="_blank" rel="noopener noreferrer">the Hanab Discord server</a> (better option)</li>
        <li>or on <a href="https://github.com/Hanabi-Live/hanabi-live" target="_blank" rel="noopener noreferrer">the GitHub repository</a> (best option)</li>
      </ul>
      When reporting, please copy/paste the stack-trace above as text, rather than showing a screenshot.
    `;

    const iosText = `You appear to be using an iPhone/iPad/iPod device (iOS). ${PROJECT_NAME} does not support Apple devices, so the above error might be an iOS-specific error. Please use a desktop PC to access the site, or refresh the page to try again`;

    const messageSuffix = isIoS() ? iosText : reportInstructions;
    showError(formattedStackTrace + messageSuffix);
  });

  // A rejected promise that nothing handled is only reported, since the page may still work.
  globalThis.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = "reason" in event ? event.reason : undefined;
    if (reason instanceof Error) {
      reportError(`Unhandled rejection: ${reason.message}`, reason.stack);
    }
  });
}

/**
 * The message of an uncaught error, in the form "Uncaught TypeError: ...". Chrome leaves the
 * event's message empty for some errors, such as a `DOMException`, so it is made from the error
 * itself.
 */
function getErrorMessage(errorEvent: ErrorEvent): string {
  const error: unknown = errorEvent.error; // Cast from `any` to `unknown`.
  return typeof error === "object"
    && error !== null
    && "name" in error
    && typeof error.name === "string"
    && "message" in error
    && typeof error.message === "string"
    ? `Uncaught ${error.name}: ${error.message}`
    : errorEvent.message;
}

function getErrorStackTrace(errorEvent: ErrorEvent): string | undefined {
  const error: unknown = errorEvent.error; // Cast from `any` to `unknown`.
  if (
    typeof error === "object"
    && error !== null
    && "stack" in error
    && typeof error.stack === "string"
  ) {
    return "message" in error
      && typeof error.message === "string"
      && !error.stack.includes(error.message)
      ? `${errorEvent.message}\n${error.stack}`
      : error.stack;
  }
  return undefined;
}

/**
 * @see
 * https://stackoverflow.com/questions/57765958/how-to-detect-ipad-and-ipad-os-version-in-ios-13-and-up
 */
function isIoS() {
  const standaloneProp = (navigator as unknown as Record<string, unknown>)[
    "standalone"
  ];
  return (
    /iPad|iPhone|iPod/u.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && standaloneProp !== undefined)
  );
}
