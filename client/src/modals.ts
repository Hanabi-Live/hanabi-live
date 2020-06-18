// Modals (boxes that hover on top of the UI)

// Imports
import { FADE_TIME } from './constants';
import * as gameChat from './game/chat';
import globals from './globals';
import * as lobbyNav from './lobby/nav';
import * as misc from './misc';
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
    $('#warning-modal').fadeOut(FADE_TIME);
    if ($('#lobby').is(':visible')) {
      $('#lobby').fadeTo(FADE_TIME, 1, () => {
        globals.modalShowing = false;
      });
    }
    if ($('#game').is(':visible')) {
      $('#game').fadeTo(FADE_TIME, 1, () => {
        globals.modalShowing = false;
      });
    }
  });

  // Error
  $('#error-modal-button').click(() => {
    window.location.reload();
  });
};

export const passwordShow = (tableID: number) => {
  $('#lobby').fadeTo(FADE_TIME, 0.25);
  misc.closeAllTooltips();
  globals.modalShowing = true;

  $('#password-modal-id').val(tableID);
  $('#password-modal').fadeIn(FADE_TIME);
  $('#password-modal-password').focus();
};

const passwordSubmit = () => {
  $('#password-modal').fadeOut(FADE_TIME);
  $('#lobby').fadeTo(FADE_TIME, 1, () => {
    globals.modalShowing = false;
  });
  const tableIDString = $('#password-modal-id').val();
  if (typeof tableIDString !== 'string') {
    throw new Error('The "password-modal-id" element does not have a string value.');
  }
  const tableID = parseInt(tableIDString, 10); // The server expects this as a number
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
};

export const warningShow = (msg: string) => {
  if ($('#lobby').is(':visible')) {
    $('#lobby').fadeTo(FADE_TIME, 0.25);
  }
  if ($('#game').is(':visible')) {
    $('#game').fadeTo(FADE_TIME, 0.25);
  }
  misc.closeAllTooltips();
  gameChat.hide();
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

  if ($('#lobby').is(':visible')) {
    $('#lobby').fadeTo(FADE_TIME, 0.1);
  }
  if ($('#game').is(':visible')) {
    $('#game').fadeTo(FADE_TIME, 0.1);
  }
  misc.closeAllTooltips();
  gameChat.hide();
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

export const closeAll = () => {
  // Error modals cannot be closed, since we want to force the user to refresh the page
  if ($('#error-modal').is(':visible')) {
    return;
  }

  for (const modal of lobbyModals) {
    $(`#${modal}-modal`).fadeOut(FADE_TIME);
  }
  $('#warning-modal').fadeOut(FADE_TIME);

  $('#lobby').fadeTo(FADE_TIME, 1, () => {
    globals.modalShowing = false;
  });
};
