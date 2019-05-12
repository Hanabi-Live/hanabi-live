/*
    The main entry point for the Hanabi client code
*/

// Browserify is used to have Node.js-style imports
// (allowing the client code to be split up into multiple files)
const chat = require('./chat');
const game = require('./game/main');
const lobby = require('./lobby/main');
const misc = require('./misc');
const modals = require('./modals');

// Initialize jQuery elements
chat.init();
game.init();
lobby.init();
modals.init();
misc.setOffscreenFilter();

// For debugging graphics
/*
$(document).ready(() => {
    $('body').click((event) => {
        console.log(`Cursor position: ${event.clientX}, ${event.clientY}`);
    });
});
*/
