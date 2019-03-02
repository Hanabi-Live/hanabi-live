/*
    WebSocket command handlers for in-game events
*/

// Imports
const buildCards = require('./buildCards');
const constants = require('../constants');
const globals = require('../globals');
const phaser = require('./phaser');

const gameCommands = [
    'action',
    'advanced',
    'boot',
    'clock',
    'connected',
    'gameOver',
    'init',
    'note',
    'notes',
    'notifyList',
    'notify',
    'replayIndicator',
    'replayLeader',
    'replayMorph',
    'replaySound',
    'replayTurn',
    'reveal',
    'spectators',
];

exports.init = () => {
    for (const command of gameCommands) {
        globals.conn.on(command, (data) => {
            if (globals.currentScreen !== 'game') {
                return;
            }

            if (window.location.pathname === '/dev2') {
                commands[command](data);
            } else if (globals.ui !== null) {
                globals.ui.handleWebsocket(command, data);
            }
        });
    }
};

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
        cardImages: {},
        scaleCardImages: {},
    };

    // Build images for every card (with respect to the variant that we are playing)
    buildCards.buildCards();

    // Draw the user interface
    phaser.init();

    // Keyboard hotkeys can only be initialized once the clue buttons are drawn
    // keyboard.init();

    // Tell the server that we are finished loading
    // globals.lobby.conn.send('ready');
};
