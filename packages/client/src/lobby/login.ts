// The initial login page.

import {
  VERSION,
  errorDetails,
  httpError,
  loginRequestSchema,
  noticeSchema,
  setTabAccountFromLogin,
} from "@hanabi-live/data";
import { flushSync } from "react-dom";
import type { z } from "zod";
import { HTTP_STATUS } from "../constants.ts";
import { reloadOutdatedClient } from "../outdatedClient.ts";
import { screenChanged } from "../sessionSlice.ts";
import { store } from "../store.ts";
import { getUrlFromPath } from "../utils.ts";
import { websocketInit } from "../websocketInit.ts";
import { TEST_COOKIE_PATH, checkCookieWithRetry } from "./cookieProbe.ts";
import {
  loginAlertCleared,
  loginFailed,
  loginPageChanged,
  loginStageChanged,
  loginStarted,
  noAccountFound,
} from "./login/loginSlice.ts";
import { loginRequestBody } from "./loginRequestBody.ts";
import { Screen } from "./types/Screen.ts";

const FIREFOX_WARNING_COOKIE_NAME = "acceptedFirefoxWarning";

export function acceptFirefoxWarning(): void {
  localStorage.setItem(FIREFOX_WARNING_COOKIE_NAME, "true");
  store.dispatch(loginStageChanged("loading"));
  automaticLogin();
}

/** Checks our saved session again, after the check failed. */
export function retryAutomaticLogin(): void {
  store.dispatch(loginAlertCleared());
  store.dispatch(loginStageChanged("loading"));
  automaticLogin();
}

/** Sends a login request. `createAccount` confirms the creation of an account that has none. */
export function signIn(
  username: string,
  password: string,
  newPassword: string | undefined,
  createAccount: boolean,
): void {
  store.dispatch(loginStarted());

  // Send a login request to the server; if successful, we will get a cookie back.
  const url = getUrlFromPath("/login");
  const data = loginRequestSchema.parse({
    username,
    password,
    newPassword,
    version: VERSION,
    createAccount,
  });

  console.log(`Sending a login request to: ${url}`);
  requestLogin(url, data)
    .then((login) => {
      if (login === undefined) {
        return;
      }
      if (login === "noAccount") {
        if (newPassword === undefined) {
          store.dispatch(noAccountFound(username));
        } else {
          formError("There is no account with that username.");
        }
        return;
      }
      if ("outdated" in login) {
        store.dispatch(
          loginFailed({ message: "", latestVersion: login.outdated }),
        );
        return;
      }
      if ("passwordReset" in login) {
        store.dispatch(
          loginFailed({ message: login.passwordReset, passwordReset: true }),
        );
        return;
      }
      // We successfully got a cookie; attempt to establish a WebSocket connection.
      setTabAccountFromLogin(login.body);
      websocketInit();
    })
    .catch((error: unknown) => {
      formError(errorDetails(error, "Logging in"));
    });
}

/**
 * Resolves to undefined when the page is reloading to update an outdated client, to "noAccount"
 * when the username has no account and we did not ask to create one, to the server's message when
 * the account needs a password reset, and to the server's release when a reload did not update an
 * outdated client.
 */
async function requestLogin(
  url: string,
  data: z.output<typeof loginRequestSchema>,
): Promise<
  | "noAccount"
  | { body: unknown }
  | { passwordReset: string }
  | { outdated: string }
  | undefined
> {
  const response = await fetch(url, {
    method: "POST",
    body: loginRequestBody(data),
  });
  if (!response.ok) {
    const notice = await errorNotice(response);
    const code = notice?.code;
    if (code === "outdatedClient") {
      return reloadOutdatedClient()
        ? undefined
        : { outdated: notice!.latestVersion ?? "" };
    }
    if (code === "noAccount") {
      return code;
    }
    if (code === "passwordResetRequired") {
      return { passwordReset: notice!.message };
    }
    throw await httpError(response, "Logging in");
  }
  return { body: await response.json() };
}

/** The notice of an HTTP error response, if it has one. */
async function errorNotice(
  response: Response,
): Promise<z.output<typeof noticeSchema> | undefined> {
  try {
    const parsed = noticeSchema.safeParse(await response.clone().json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function automaticLogin(): void {
  // Automatically sign in to the WebSocket server if a query string of "?login" is present (which
  // is intended to be used with test accounts).
  const urlParams = new URLSearchParams(globalThis.location.search);
  const username = urlParams.get("login");
  if (username !== null && username !== "") {
    console.log(`Automatically logging in as "${username}".`);
    // For test accounts, we use the username as the password, and create the account if needed.
    signIn(username, username, "", true);
    return;
  }

  // If we have logged in previously and our cookie is still good, automatically login.
  console.log("Testing to see if we have a cached WebSocket cookie.");
  checkCookieWithRetry()
    .catch((error: unknown) => {
      // Handle only failures of the cookie check; a later WebSocket error is separate.
      console.error(`Failed to fetch "${TEST_COOKIE_PATH}":`, error);
      store.dispatch(
        loginFailed({
          message: errorDetails(error, "Checking your saved session"),
          retry: true,
        }),
      );

      if (!showFirefoxWarningIfNeeded()) {
        show();
      }
      return undefined;
    })
    .then((response) => {
      if (response === undefined || showFirefoxWarningIfNeeded()) {
        return;
      }

      if (response.status === HTTP_STATUS.OK) {
        console.log(
          "WebSocket cookie confirmed to be good. Automatically logging in to the WebSocket server.",
        );
        websocketInit();
        return;
      }

      if (response.status === HTTP_STATUS.NO_CONTENT) {
        console.log(
          "Either we have not previously logged in or the existing cookie is expired.",
        );
      } else {
        console.log(
          "Received an unknown status back from the server:",
          response.status,
        );
      }
      show();
    })
    .catch((error: unknown) => {
      // Do not report errors from websocketInit() as cookie-check failures.
      console.error("Automatic login initialization failed:", error);
      if (!showFirefoxWarningIfNeeded()) {
        show();
      }
    });
}

function isBrowserFirefox() {
  return navigator.userAgent.toLowerCase().includes("firefox");
}

function showFirefoxWarningIfNeeded(): boolean {
  if (
    isBrowserFirefox()
    && localStorage.getItem(FIREFOX_WARNING_COOKIE_NAME) !== "true"
  ) {
    store.dispatch(loginStageChanged("firefoxWarning"));
    return true;
  }
  return false;
}

// -------------------------
// Miscellaneous subroutines
// -------------------------

function show() {
  store.dispatch(loginStageChanged("signIn"));
}

/** Leaves the login screen for the tutorial or, for a user who has seen it, for the lobby. */
export function hide(firstTimeUser: boolean): void {
  if (!firstTimeUser && store.getState().session.screen === Screen.Login) {
    // During the tutorial, the server can already have sent us to a pre-game screen, so only leave
    // the login screen.
    store.dispatch(screenChanged(Screen.Lobby));
  }

  // "App.tsx" shows the page at once, so that the code that runs next finds the lobby.
  flushSync(() => {
    store.dispatch(loginPageChanged(firstTimeUser ? "tutorial" : "lobby"));
  });
}

function formError(message: string) {
  store.dispatch(loginFailed({ message }));
}
