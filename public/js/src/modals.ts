/*
    Modals (boxes that hover on top of the UI)
*/

// Imports
import shajs from 'sha.js';
import { FADE_TIME } from './constants';
import * as gameChat from './game/chat';
import globals from './globals';
import * as misc from './misc';
import * as lobbyNav from './lobby/nav';

// The list of all of the modals
const modals = [
    'password',
    // "warning" and "error" are intentionally omitted, as they are handled separately
];

// Initialize various element behavior within the modals
export const init = () => {
    // All modals
    for (const modal of modals) {
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
            $('#lobby').fadeTo(FADE_TIME, 1);
        }
        if ($('#game').is(':visible')) {
            $('#game').fadeTo(FADE_TIME, 1);
        }
    });

    // Error
    $('#error-modal-button').click(() => {
        window.location.reload();
    });
    $('#error-modal-signout').click(() => {
        lobbyNav.signOut();
    });
};

export const passwordShow = (tableID: number) => {
    $('#lobby').fadeTo(FADE_TIME, 0.25);
    misc.closeAllTooltips();

    $('#password-modal-id').val(tableID);
    $('#password-modal').fadeIn(FADE_TIME);
    $('#password-modal-password').focus();
};

const passwordSubmit = () => {
    $('#password-modal').fadeOut(FADE_TIME);
    $('#lobby').fadeTo(FADE_TIME, 1);
    const tableIDString = $('#password-modal-id').val();
    if (typeof tableIDString !== 'string') {
        throw new Error('The "password-modal-id" element does not have a string value.');
    }
    const tableID = parseInt(tableIDString, 10); // The server expects this as a number
    const passwordPlaintext = $('#password-modal-password').val();
    const stringToHash = `Hanabi game password ${passwordPlaintext}`;
    const password = shajs('sha256').update(stringToHash).digest('hex');
    globals.conn.send('tableJoin', {
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

    $('#warning-modal-description').html(msg);
    $('#warning-modal').fadeIn(FADE_TIME);
};

export const errorShow = (msg: string) => {
    // Do nothing if we are already showing the error modal
    if (globals.errorOccured) {
        return;
    }
    globals.errorOccured = true;

    if ($('#lobby').is(':visible')) {
        $('#lobby').fadeTo(FADE_TIME, 0.1);
    }
    if ($('#game').is(':visible')) {
        $('#game').fadeTo(FADE_TIME, 0.1);
    }
    misc.closeAllTooltips();
    gameChat.hide();

    // Clear out the top navigation buttons
    lobbyNav.show('nothing');

    $('#error-modal-description').html(msg);
    $('#error-modal').fadeIn(FADE_TIME);

    // Show the "Sign Out" button if this is a specific type of error message
    if (msg.startsWith('You have logged on from somewhere else')) {
        $('#error-modal-signout').show();
    } else {
        $('#error-modal-signout').hide();
    }
};

export const closeAll = () => {
    for (const modal of modals) {
        $(`#${modal}-modal`).fadeOut(FADE_TIME);
    }
    $('#lobby').fadeTo(FADE_TIME, 1);
};
