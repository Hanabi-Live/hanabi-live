/*
    WebSocket command handlers for in-game events
*/

// Imports
const globals = require('../globals');

const gameCommands = [
    'action',
    'advanced',
    'boot',
    'clock',
    'connected',
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
    'spectators',
];

exports.init = () => {
    for (const command of gameCommands) {
        globals.conn.on(command, (data) => {
            if (globals.currentScreen === 'game' && globals.ui !== null) {
                globals.ui.handleWebsocket(command, data);
            }
        });
    }
};
