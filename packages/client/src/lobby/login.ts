// The initial login page.

import type { HTTPLoginData } from "@hanabi/data";
import { VERSION } from "@hanabi/data";
import * as KeyCode from "keycode-js";
import { globals } from "../Globals";
import { FADE_TIME } from "../constants";
import { getHTMLElement, getHTMLInputElement, getURLFromPath } from "../utils";
import { websocketInit } from "../websocketInit";
import * as nav from "./nav";
import { tablesDraw } from "./tablesDraw";
import { Screen } from "./types/Screen";
import * as usersDraw from "./usersDraw";

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
    show();
  });

  $("#change-password-link").on("click", (event) => {
    event.preventDefault();
    const div = $("#change-password-container");
    if (div.hasClass("hidden")) {
      $("#login-password").attr("placeholder", "Old Password");
      $("#change-password-container")
        .slideDown()
        .delay(500)
        .removeClass("hidden");
      $("#login-button").html("Sign In & Change Password");
    } else {
      $("#login-password").attr("placeholder", "Password");
      $("#change-password-container").slideUp().delay(500).addClass("hidden");
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
  const data = {
    username,
    password,
    newPassword,
    version: VERSION,
  } satisfies HTTPLoginData;

  // eslint-disable-next-line isaacscript/no-object-any
  const request = $.ajax({
    url,
    type: "POST",
    data,
  });
  console.log(`Sent a login request to: ${url}`);

  request
    .done(() => {
      // We successfully got a cookie; attempt to establish a WebSocket connection.
      websocketInit();
    })
    .fail((jqXHR) => {
      formError(`Login failed: ${getAjaxError(jqXHR)}`);
    })
    .catch((error) => {
      formError(`Login failed: ${getAjaxError(error)}`);
    });
}

function getAjaxError(jqXHR: JQuery.jqXHR) {
  if (jqXHR.readyState === 0) {
    return "A network error occurred. The server might be down!";
  }
  if (jqXHR.responseText === "") {
    return "An unknown error occurred.";
  }
  return jqXHR.responseText;
}

export function automaticLogin(): void {
  // Automatically sign in to the WebSocket server if a query string of "?login" is present (which
  // is intended to be used with test accounts).
  const urlParams = new URLSearchParams(window.location.search);
  const username = urlParams.get("login");
  if (username !== null && username !== "") {
    console.log(`Automatically logging in as "${username}".`);
    send(username, username, ""); // For test accounts, we use the username as the password.
    return;
  }

  // If we have logged in previously and our cookie is still good, automatically login.
  console.log("Testing to see if we have a cached WebSocket cookie.");
  const testCookiePath = "/test-cookie";
  fetch(testCookiePath)
    .then((response) => {
      // Check to see if we have accepted the Firefox warning.
      if (
        isBrowserFirefox() &&
        localStorage.getItem(FIREFOX_WARNING_COOKIE_NAME) !== "true" // Cookies are strings.
      ) {
        $("#loading").hide();
        $("#firefox-warning").show();
        return;
      }

      if (response.status === 200) {
        console.log(
          "WebSocket cookie confirmed to be good. Automatically logging in to the WebSocket server.",
        );
        websocketInit();
        return;
      }

      if (response.status === 204) {
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
    .catch((error) => {
      console.error(`Failed to fetch "${testCookiePath}":`, error);
    });
}

function isBrowserFirefox() {
  return navigator.userAgent.toLowerCase().includes("firefox");
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
    $("#tutorial").fadeIn(FADE_TIME);
    return;
  }
  $("#tutorial").hide();

  // Disable scroll bars. Even with height and width 100%, the scroll bar can pop up when going back
  // from a game to the lobby. It also can show up in-game if a tooltip animates off of the edge of
  // the screen. So we can set "overflow" to explicitly prevent this from occurring. We do not want
  // to set this in "hanabi.css" because there should be scrolling enabled on the login screen. We
  // need to scroll to the top of the screen before disabling the scroll bars or else the lobby can
  // become misaligned when logging in from a scroll-down state.
  window.scrollTo(0, 0);
  $("body").css("overflow", "hidden");

  // Show the lobby
  globals.currentScreen = Screen.Lobby;
  tablesDraw();
  usersDraw.draw(); // If we were in the tutorial, we have to re-draw all of the user rows
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
    $("#login-alert").fadeIn(FADE_TIME);

    const offset = $("#login-alert").offset();
    if (offset === undefined) {
      throw new Error(
        'Failed to get the coordinates for the "#login-alert" element.',
      );
    }
    $("html, body").animate(
      {
        scrollTop: offset.top,
      },
      500,
    );
  }, 0);
}
