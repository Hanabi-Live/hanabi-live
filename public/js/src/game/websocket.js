/*
    WebSocket command handlers for in-game events
*/

// Imports
const constants = require('../constants');
const drawCards = require('./drawCards');
const globals = require('../globals');
const phaser = require('./phaser');
const websocket = require('./ui/websocket');

exports.init = () => {
    let commandsToUse;
    if (window.location.pathname === '/dev2') {
        commandsToUse = commands; // The new client, defined below
    } else {
        commandsToUse = websocket; // The old client, defined in the "ui/websocket.js" file
    }

    for (const command of Object.keys(commandsToUse)) {
        globals.conn.on(command, (data) => {
            if (globals.currentScreen !== 'game') {
                return;
            }

            commandsToUse[command](data);
        });
    }
};

/*
    Code for the new development client
*/

// Define a command handler map
const commands = {};

commands.init = (data) => {
    // Record all of the settings for this game
    globals.init = data;

    // The variant is an integer on the server side, but an object on the client side,
    // so convert it accordingly
    globals.init.variant = constants.VARIANTS[data.variant];

    // Also initalize the "ui" object, which contains various graphical objects
    globals.ui = {
        cards: [],
        cardImages: {},
        scaledCardImages: {},
    };

    // Build images for every card (with respect to the variant that we are playing)
    drawCards.drawAll();

    // Draw the user interface
    phaser.init();

    // Keyboard hotkeys can only be initialized once the clue buttons are drawn
    // keyboard.init();

    // Tell the server that we are finished loading
    // globals.lobby.conn.send('ready');
};
