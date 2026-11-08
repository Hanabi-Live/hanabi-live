// The initial login page.

import {
  VERSION,
  errorDetails,
  httpError,
  loginRequestSchema,
  setTabAccountFromLogin,
} from "@hanabi-live/data";
import { assertDefined } from "complete-common";
import * as KeyCode from "keycode-js";
import type { z } from "zod";
import { globals } from "../Globals";
import { FADE_TIME_MS, HTTP_STATUS } from "../constants";
import { getHTMLElement, getHTMLInputElement, getURLFromPath } from "../utils";
import { websocketInit } from "../websocketInit";
import { TEST_COOKIE_PATH, checkCookieWithRetry } from "./cookieProbe";
import * as nav from "./nav";
import { tablesDraw } from "./tablesDraw";
import { Screen } from "./types/Screen";

/** How long the change-password form and the scroll to an error take to animate. */
const ANIMATION_TIME_MS = 500;

const FIREFOX_WARNING_COOKIE_NAME = "acceptedFirefoxWarning";

const changePassword = getHTMLInputElement("#change-password");
const changePasswordContainer = getHTMLElement("#change-password-container");
const loginUsername = getHTMLInputElement("#login-username");
const loginPassword = getHTMLInputElement("#login-password");

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

  send(username, password, newPassword);
}

function send(
  username: string,
  password: string,
  newPassword: string | undefined,
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
  });

  console.log(`Sending a login request to: ${url}`);
  requestLogin(url, data)
    .then((body) => {
      // We successfully got a cookie; attempt to establish a WebSocket connection.
      setTabAccountFromLogin(body);
      websocketInit();
    })
    .catch((error: unknown) => {
      formError(errorDetails(error, "Logging in"));
    });
}

async function requestLogin(
  url: string,
  data: z.output<typeof loginRequestSchema>,
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    body: new URLSearchParams(data),
  });
  if (!response.ok) {
    throw await httpError(response, "Logging in");
  }
  return await response.json();
}

export function automaticLogin(): void {
  // Automatically sign in to the WebSocket server if a query string of "?login" is present (which
  // is intended to be used with test accounts).
  const urlParams = new URLSearchParams(globalThis.location.search);
  const username = urlParams.get("login");
  if (username !== null && username !== "") {
    console.log(`Automatically logging in as "${username}".`);
    send(username, username, ""); // For test accounts, we use the username as the password.
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
      return null;
    })
    .then((response) => {
      if (response === null || showFirefoxWarningIfNeeded()) {
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
  // to set this in "hanabi.css" because there should be scrolling enabled on the login screen. We
  // need to scroll to the top of the screen before disabling the scroll bars or else the lobby can
  // become misaligned when logging in from a scroll-down state. The login screen can scroll the
  // body element itself rather than the window, so reset both.
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  $("body").css("overflow", "hidden");

  // Show the lobby
  globals.currentScreen = Screen.Lobby;
  tablesDraw();
  $("#lobby").show();
  $("#lobby-history").hide();
  // We can't hide this element by default in "index.html" or else the "No game history" text will
  // not be centered.
  nav.show("lobby");
  $("#lobby-chat-input").trigger("focus");

  // Scroll to the bottom of the chat. (This is necessary if we are going to the lobby after the
  // tutorial.)
  const chat = $("#lobby-chat-text");
  chat.animate(
    {
      scrollTop: chat[0]!.scrollHeight,
    },
    0,
  );
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
