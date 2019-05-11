/*
    The main entry point for the Hanabi client code
*/

// Browserify is used to have Node.js-style imports
// (allowing the client code to be split up into multiple files)
require('./game/main');
require('./lobby/main');
const modals = require('./modals');

modals.init();

// For debugging graphics
/*
$(document).ready(() => {
    $('body').click((event) => {
        console.log(`Cursor position: ${event.clientX}, ${event.clientY}`);
    });
});
*/
