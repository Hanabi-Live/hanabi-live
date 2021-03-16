// Modals (boxes that hover on top of the UI)

import { FADE_TIME } from "./constants";
import globals from "./globals";
import * as lobbyNav from "./lobby/nav";
import { closeAllTooltips, parseIntSafe } from "./misc";
import * as sounds from "./sounds";

// The list of all of the modals
const lobbyModals = [
  "password",
  // "warning" and "error" are intentionally omitted, as they are handled separately
];

// Initialize various element behavior within the modals
export function init(): void {
  // There are not currently any game modals
  for (const modal of lobbyModals) {
    $(`#${modal}-modal-cancel`).click(closeAll);
  }

  // Password
  $("#password-modal-password").on("keypress", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      $("#password-modal-submit").click();
    }
  });
  $("#password-modal-submit").click(passwordSubmit);

  // Warning
  $("#warning-modal-button").click(() => {
    warningClose();
  });

  // Error
  $("#error-modal-button").click(() => {
    window.location.reload();
  });
}

export function passwordShow(tableID: number): void {
  setShadeOpacity(0.75);
  closeAllTooltips();
  globals.modalShowing = true;

  $("#password-modal-id").val(tableID);
  $("#password-modal").fadeIn(FADE_TIME);
  $("#password-modal-password").focus();

  // We want to fill in the text field with the player's last typed-in password
  const password = localStorage.getItem("joinTablePassword");
  if (password !== null && password !== "") {
    $("#password-modal-password").val(password);
    $("#password-modal-password").select();
  }
}

function passwordSubmit() {
  $("#password-modal").fadeOut(FADE_TIME);
  setShadeOpacity(0, false);
  const tableIDString = $("#password-modal-id").val();
  if (typeof tableIDString !== "string") {
    throw new Error(
      'The "password-modal-id" element does not have a string value.',
    );
  }
  const tableID = parseIntSafe(tableIDString); // The server expects this as a number
  let password = $("#password-modal-password").val();
  if (typeof password === "number") {
    password = password.toString();
  }
  if (typeof password !== "string") {
    return;
  }
  globals.conn!.send("tableJoin", {
    tableID,
    password,
  });

  // Record the password in local storage (cookie)
  localStorage.setItem("joinTablePassword", password);
}

export function warningShow(msg: string): void {
  closeAllTooltips();
  setShadeOpacity(0.75);
  globals.modalShowing = true;

  $("#warning-modal-description").html(msg);

  // store the screen's active element
  globals.lastActiveElement = document.activeElement as HTMLElement;

  // show the modal and focus the close button
  $("#warning-modal").fadeIn(FADE_TIME, () => {
    $("#warning-modal-button").focus();
  });
}

export function errorShow(msg: string): void {
  // Do nothing if we are already showing the error modal
  if (globals.errorOccurred) {
    return;
  }
  globals.errorOccurred = true;

  closeAllTooltips();
  setShadeOpacity(0.9);
  globals.modalShowing = true;

  // Clear out the top navigation buttons
  lobbyNav.show("nothing");

  $("#error-modal-description").html(msg);
  $("#error-modal").fadeIn(FADE_TIME);

  // Play a sound if the server has shut down
  if (/The server is going down for scheduled maintenance./.exec(msg)) {
    sounds.play("turn_double_discard");
  }
}

// Make the page cover a certain opacity
// If it is 0, then the page cover will be hidden
// The second parameter is necessary to set the variable after fading finishes
export function setShadeOpacity(
  opacity: number,
  newModalShowing?: boolean,
): void {
  const pageCover = $("#page-cover");
  if (opacity > 0) {
    pageCover.show();
  }
  // Make sure to stop any fading that was called earlier
  pageCover.stop().fadeTo(FADE_TIME, opacity, () => {
    if (opacity === 0) {
      pageCover.hide();
    }
    if (newModalShowing !== undefined) {
      globals.modalShowing = newModalShowing;
    }
  });
}

function warningClose() {
  $("#warning-modal").fadeOut(FADE_TIME);
  setShadeOpacity(0, false);
  if (globals.lastActiveElement) {
    globals.lastActiveElement.focus();
  }
}

export function closeAll(): void {
  // Error modals cannot be closed, since we want to force the user to refresh the page
  if ($("#error-modal").is(":visible")) {
    return;
  }

  for (const modal of lobbyModals) {
    $(`#${modal}-modal`).fadeOut(FADE_TIME);
  }

  warningClose();
}
