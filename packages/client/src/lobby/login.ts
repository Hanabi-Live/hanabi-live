// The initial login page.

import {
  NO_ACCOUNT_CODE,
  OUTDATED_CLIENT_CODE,
  VERSION,
  errorDetails,
  httpError,
  loginRequestSchema,
  noticeSchema,
  setTabAccountFromLogin,
} from "@hanabi-live/data";
import { assertDefined } from "complete-common";
import * as KeyCode from "keycode-js";
import type { z } from "zod";
import { globals } from "../Globals";
import { FADE_TIME_MS, HTTP_STATUS } from "../constants";
import { reloadOutdatedClient } from "../outdatedClient";
import * as theme from "../theme";
import { getHTMLElement, getHTMLInputElement, getURLFromPath } from "../utils";
import { websocketInit } from "../websocketInit";
import { scrollLobbyChatToBottom } from "./chat/LobbyChat";
import { TEST_COOKIE_PATH, checkCookieWithRetry } from "./cookieProbe";
import { loginRequestBody } from "./loginRequestBody";
import * as nav from "./nav";
import { Screen } from "./types/Screen";

/** How long the change-password form and the scroll to an error take to animate. */
const ANIMATION_TIME_MS = 500;

const FIREFOX_WARNING_COOKIE_NAME = "acceptedFirefoxWarning";

const changePassword = getHTMLInputElement("#change-password");
const changePasswordContainer = getHTMLElement("#change-password-container");
const loginUsername = getHTMLInputElement("#login-username");
const loginPassword = getHTMLInputElement("#login-password");

/**
 * The username that the server said has no account. Submitting it again creates the account, so
 * that a mistyped username does not create one by accident.
 */
let confirmingUsername: string | undefined;

export function init(): void {
  $("#login-button").on("click", () => {
    $("#login-form").trigger("submit");
  });

  $("#login-form").on("keypress", (event) => {
    if (event.which === KeyCode.KEY_RETURN) {
      event.preventDefault();
      $("#login-form").trigger("submit");
    }
  });

  $("#login-form").on("submit", submit);

  // Editing the username cancels the account creation that it was about to confirm.
  $("#login-username").on("input", () => {
    if (confirmingUsername !== undefined) {
      setConfirmingUsername(undefined);
    }
  });

  $("#firefox-warning-button").on("click", () => {
    localStorage.setItem(FIREFOX_WARNING_COOKIE_NAME, "true");
    $("#firefox-warning").hide();
    $("#loading").show();
    automaticLogin();
  });

  $("#change-password-link").on("click", (event) => {
    event.preventDefault();
    const div = $("#change-password-container");
    if (div.hasClass("hidden")) {
      $("#login-password").attr("placeholder", "Old Password");
      $("#change-password-container")
        .slideDown()
        .delay(ANIMATION_TIME_MS)
        .removeClass("hidden");
      setConfirmingUsername(undefined);
      $("#login-button").html("Sign In & Change Password");
    } else {
      $("#login-password").attr("placeholder", "Password");
      $("#change-password-container")
        .slideUp()
        .delay(ANIMATION_TIME_MS)
        .addClass("hidden");
      $("#login-button").html("Sign In");
    }
    $("#login-username").trigger("focus");
  });
}

function submit(event: JQuery.Event) {
  // By default, the form will reload the page, so stop this from happening.
  event.preventDefault();

  const username = loginUsername.value;
  if (username === "") {
    formError("You must provide a username.");
    return;
  }

  const password = loginPassword.value;
  if (password === "") {
    formError("You must provide a password.");
    return;
  }

  const changePasswordInputIsShowing =
    !changePasswordContainer.classList.contains("hidden");

  let newPassword: string | undefined;
  if (changePasswordInputIsShowing) {
    if (changePassword.value === "") {
      formError("You must provide a new password.");
      return;
    }

    newPassword = changePassword.value;
  }

  send(username, password, newPassword, username === confirmingUsername);
}

/** Asks the player to confirm the creation of an account, or stops asking with undefined. */
function setConfirmingUsername(username: string | undefined) {
  confirmingUsername = username;
  const notice = $("#login-no-account");
  if (username === undefined) {
    notice.addClass("hidden").empty();
    $("#login-button").html("Sign In");
    return;
  }
  notice
    .empty()
    .append(
      "There is no account named ",
      $("<strong>").text(username),
      '. Check the spelling, or click "Create Account" to create it.',
    )
    .removeClass("hidden");
  $("#login-button").html("Create Account");
}

function send(
  username: string,
  password: string,
  newPassword: string | undefined,
  createAccount: boolean,
) {
  $("#login-button").addClass("disabled");
  $("#login-explanation").hide();
  $("#login-ajax").show();

  // Send a login request to the server; if successful, we will get a cookie back.
  const url = getURLFromPath("/login");
  const data = loginRequestSchema.parse({
    username,
    password,
    newPassword,
    version: VERSION,
    darkMode: theme.systemPrefersDark(),
    createAccount,
  });

  console.log(`Sending a login request to: ${url}`);
  requestLogin(url, data)
    .then((login) => {
      if (login === undefined) {
        return;
      }
      if (login === NO_ACCOUNT_CODE) {
        if (newPassword === undefined) {
          $("#login-ajax").hide();
          $("#login-button").removeClass("disabled");
          $("#login-alert").hide();
          setConfirmingUsername(username);
        } else {
          formError("There is no account with that username.");
        }
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
 * Resolves to undefined when the page is reloading to update an outdated client, and to
 * `NO_ACCOUNT_CODE` when the username has no account and we did not ask to create one.
 */
async function requestLogin(
  url: string,
  data: z.output<typeof loginRequestSchema>,
): Promise<typeof NO_ACCOUNT_CODE | { body: unknown } | undefined> {
  const response = await fetch(url, {
    method: "POST",
    body: loginRequestBody(data),
  });
  if (!response.ok) {
    const code = await errorCode(response);
    if (code === OUTDATED_CLIENT_CODE && reloadOutdatedClient()) {
      return undefined;
    }
    if (code === NO_ACCOUNT_CODE) {
      return NO_ACCOUNT_CODE;
    }
    throw await httpError(response, "Logging in");
  }
  return { body: await response.json() };
}

/** The `code` of an HTTP error response, if it has one. */
async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const parsed = noticeSchema.safeParse(await response.clone().json());
    return parsed.success ? parsed.data.code : undefined;
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
    send(username, username, "", true);
    return;
  }

  // If we have logged in previously and our cookie is still good, automatically login.
  console.log("Testing to see if we have a cached WebSocket cookie.");
  checkCookieWithRetry()
    .catch((error: unknown) => {
      // Handle only failures of the cookie check; a later WebSocket error is separate.
      console.error(`Failed to fetch "${TEST_COOKIE_PATH}":`, error);
      const alert = $("#login-alert");
      alert.text(errorDetails(error, "Checking your saved session"));
      const retryButton = $("<button>", { type: "button" }).text("Retry");
      retryButton.on("click", () => {
        alert.hide();
        $("#sign-in").hide();
        $("#loading").show();
        automaticLogin();
      });
      alert.append(" ", retryButton).show();

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
    $("#loading").hide();
    $("#firefox-warning").show();
    return true;
  }
  return false;
}

// -------------------------
// Miscellaneous subroutines
// -------------------------

function show() {
  $("#loading").hide();
  $("#firefox-warning").hide();
  $("#sign-in").show();
  $("#login-username").trigger("focus");
}

export function hide(firstTimeUser: boolean): void {
  // Hide the login screen
  $("#login").hide();

  if (firstTimeUser) {
    $("#tutorial").fadeIn(FADE_TIME_MS);
    return;
  }
  $("#tutorial").hide();

  // Disable scroll bars. Even with height and width 100%, the scroll bar can pop up when going back
  // from a game to the lobby. It also can show up in-game if a tooltip animates off of the edge of
  // the screen. So we can set "overflow" to explicitly prevent this from occurring. We do not want
  // to set this in the stylesheets because there should be scrolling enabled on the login screen.
  // We need to scroll to the top of the screen before disabling the scroll bars or else the lobby
  // can become misaligned when logging in from a scroll-down state. The login screen can scroll the
  // body element itself rather than the window, so reset both.
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  $("body").css("overflow", "hidden");

  // Show the lobby
  globals.currentScreen = Screen.Lobby;
  $("#lobby").removeClass("hidden");
  $("#lobby-history").hide();
  // We can't hide this element by default in "index.html" or else the "No game history" text will
  // not be centered.
  nav.show("lobby");
  $("#lobby-chat-input").trigger("focus");

  // Scroll to the bottom of the chat. (This is necessary if we are going to the lobby after the
  // tutorial.)
  scrollLobbyChatToBottom();
}

function formError(msg: string) {
  // For some reason this has to be invoked asynchronously in order to work properly.
  setTimeout(() => {
    $("#login-ajax").hide();
    $("#login-button").removeClass("disabled");
    $("#login-alert").html(msg);
    $("#login-alert").fadeIn(FADE_TIME_MS);

    const offset = $("#login-alert").offset();
    assertDefined(
      offset,
      'Failed to get the coordinates for the "#login-alert" element.',
    );

    $("html, body").animate(
      {
        scrollTop: offset.top,
      },
      ANIMATION_TIME_MS,
    );
  }, 0);
}
