/*
    The main entry point for the Hanabi client code
*/

// Browserify is used to have Node.js-style imports
// (allowing the client code to be split up into multiple files)
const chat = require('./chat');
const lobby = require('./lobby/main');
const game = require('./game/main');
const misc = require('./misc');
const modals = require('./modals');

$(document).ready(() => {
    // Now that the page has loaded, initialize and define the functionality of various UI elements
    // (mostly using jQuery selectors)
    chat.init();
    lobby.createGame.init();
    lobby.history.init();
    lobby.login.init();
    lobby.nav.init();
    lobby.settings.init();
    lobby.tutorial.init();
    lobby.watchReplay.init();
    game.init();
    game.chat.init();
    game.sounds.init();
    game.tooltips.init();
    misc.init();
    modals.init();

    // For debugging graphics
    /*
    $('body').click((event) => {
        console.log(`Cursor position: ${event.clientX}, ${event.clientY}`);
    });
    */

    // Now that the UI is initialized, automatically login if the user has cached credentials
    lobby.login.automaticLogin();
});
