import { PROJECT_NAME } from "@hanabi-live/data";
import { showError } from "./modals";
import { escapeHtml } from "./utils";

/** Initialize a global error handler that will show errors to the end-user. */
export function initErrorListener(): void {
  globalThis.addEventListener("error", (errorEvent) => {
    if (
      (errorEvent.lineno === 0
        && errorEvent.colno === 0
        && errorEvent.filename === ""
        && errorEvent.error === null)
      || (errorEvent.lineno === 1
        && errorEvent.colno === 16
        && !errorEvent.filename.endsWith("/main.min.js"))
    ) {
      // Some buggy code that the browser injected is causing an error. Safe to ignore. This occurs
      // on the Brave browser on iOS. Line 1:16 corresponds to the character directly after the
      // opening <!doctype HTML> of each page.
      return;
    }

    const stackTrace = getErrorStackTrace(errorEvent) ?? errorEvent.message;
    const formattedStackTrace = `<pre>${escapeHtml(stackTrace)}</pre>`;

    const reportInstructions = `
      In order to make the website better, please report this error along with steps that you did to
      cause it. You can report it:
      <ul>
        <li>in the lobby chat (worst option)</li>
        <li>or in <a href="https://discord.gg/FADvkJp">the Hanab Discord server</a> (better option)</li>
        <li>or <a href="https://github.com/Hanabi-Live/hanabi-live">on the GitHub repository</a> (best option)</li>
      </ul>
      When reporting, please copy/paste the stack-trace above as text, rather than showing a screenshot.
    `;

    const iosText = `You appear to be using an iPhone/iPad/iPod device (i.e. iOS). ${PROJECT_NAME} does not support Apple devices, so the above error might be an iOS-specific error. Please use a desktop PC to access the site, or refresh the page to try again`;

    const messageSuffix = isIoS() ? iosText : reportInstructions;
    showError(formattedStackTrace + messageSuffix);
  });
}

function getErrorStackTrace(errorEvent: ErrorEvent): string | undefined {
  const error: unknown = errorEvent.error; // Cast from `any` to `unknown`.
  if (
    typeof error === "object"
    && error !== null
    && "stack" in error
    && typeof error.stack === "string"
  ) {
    if (
      "message" in error
      && typeof error.message === "string"
      && !error.stack.includes(error.message)
    ) {
      return `${errorEvent.message}\n${error.stack}`;
    }
    return error.stack;
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
