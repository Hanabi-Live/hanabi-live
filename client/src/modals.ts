// Modals (boxes that hover on top of the UI)

import { FADE_TIME } from './constants';
import globals from './globals';
import * as lobbyNav from './lobby/nav';
import { closeAllTooltips, parseIntSafe } from './misc';
import * as sounds from './sounds';

// The list of all of the modals
const lobbyModals = [
  'password',
  // "warning" and "error" are intentionally omitted, as they are handled separately
];

// Initialize various element behavior within the modals
export const init = () => {
  // There are not currently any game modals
  for (const modal of lobbyModals) {
    $(`#${modal}-modal-cancel`).click(closeAll);
  }

  // Password
  $('#password-modal-password').on('keypress', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('#password-modal-submit').click();
    }
  });
  $('#password-modal-submit').click(passwordSubmit);

  // Warning
  $('#warning-modal-button').click(() => {
    warningClose();
  });

  // Error
  $('#error-modal-button').click(() => {
    window.location.reload();
  });
};

export const passwordShow = (tableID: number) => {
  setShadeOpacity(0.75);
  closeAllTooltips();
  globals.modalShowing = true;

  $('#password-modal-id').val(tableID);
  $('#password-modal').fadeIn(FADE_TIME);
  $('#password-modal-password').focus();
};

const passwordSubmit = () => {
  $('#password-modal').fadeOut(FADE_TIME);
  setShadeOpacity(0, false);
  const tableIDString = $('#password-modal-id').val();
  if (typeof tableIDString !== 'string') {
    throw new Error('The "password-modal-id" element does not have a string value.');
  }
  const tableID = parseIntSafe(tableIDString); // The server expects this as a number
  let password = $('#password-modal-password').val();
  if (typeof password === 'number') {
    password = password.toString();
  }
  if (typeof password !== 'string') {
    return;
  }
  globals.conn!.send('tableJoin', {
    tableID,
    password,
  });

  // Record the password in local storage (cookie)
  localStorage.setItem('joinTablePassword', password);
};

export const warningShow = (msg: string) => {
  setShadeOpacity(0.75);
  globals.modalShowing = true;

  $('#warning-modal-description').html(msg);
  $('#warning-modal').fadeIn(FADE_TIME);
};

export const errorShow = (msg: string) => {
  // Do nothing if we are already showing the error modal
  if (globals.errorOccurred) {
    return;
  }
  globals.errorOccurred = true;

  setShadeOpacity(0.9);
  globals.modalShowing = true;

  // Clear out the top navigation buttons
  lobbyNav.show('nothing');

  $('#error-modal-description').html(msg);
  $('#error-modal').fadeIn(FADE_TIME);

  // Play a sound if the server has shut down
  if (msg.match(/The server is going down for scheduled maintenance./)) {
    sounds.play('turn_double_discard');
  }
};

// Make the page cover a certain opacity
// If it is 0, then the page cover will be hidden
// The second parameter is necessary to set the variable after fading finishes
export const setShadeOpacity = (opacity: number, newModalShowing?: boolean) => {
  const pageCover = $('#page-cover');
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
};

const warningClose = () => {
  $('#warning-modal').fadeOut(FADE_TIME);
  setShadeOpacity(0, false);
};

export const closeAll = () => {
  // Error modals cannot be closed, since we want to force the user to refresh the page
  if ($('#error-modal').is(':visible')) {
    return;
  }

  for (const modal of lobbyModals) {
    $(`#${modal}-modal`).fadeOut(FADE_TIME);
  }

  warningClose();
};
