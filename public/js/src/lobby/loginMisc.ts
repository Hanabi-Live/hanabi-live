/*
    These are miscellaneous functions relating to the login form that need to be put in a different
    file to avoid cyclic dependencies
*/

// Imports
import { FADE_TIME } from '../constants';
import globals from '../globals';
import * as nav from './nav';
import tablesDraw from './tablesDraw';
import usersDraw from './usersDraw';

export const hide = (firstTimeUser: boolean) => {
    // Hide the login screen
    $('#login').hide();

    if (firstTimeUser) {
        $('#tutorial').fadeIn(FADE_TIME);
        return;
    }
    $('#tutorial').hide();

    /*
        Disable scroll bars
        Even with height and width 100%,
        the scroll bar can pop up when going back from a game to the lobby
        It also can show up in-game if a tooltip animates off of the edge of the screen
        So we can set "overflow" to explicitly prevent this from occuring
        We don't want to set this in "hanabi.css" because
        there should be scrolling enabled on the login screen
        We need to scroll to the top of the screen before disabling the scroll bars
        or else the lobby can become misaligned when logging in from a scroll-down state
    */
    window.scrollTo(0, 0);
    $('body').css('overflow', 'hidden');

    // Show the lobby
    globals.currentScreen = 'lobby';
    tablesDraw();
    usersDraw();
    $('#lobby').show();
    $('#lobby-history').hide();
    // We can't hide this element by default in "index.html" or else the "No game history" text
    // will not be centered
    nav.show('games');
    $('#lobby-chat-input').focus();
};

export const formError = (msg: string) => {
    // For some reason this has to be invoked asycnronously in order to work properly
    setTimeout(() => {
        $('#login-ajax').hide();
        $('#login-button').removeClass('disabled');
        $('#login-alert').html(msg);
        $('#login-alert').fadeIn(FADE_TIME);
    }, 0);
};
