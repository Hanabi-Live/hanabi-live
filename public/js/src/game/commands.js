/*
    WebSocket command handlers for in-game events
*/

// Imports
const globals = require('../globals');

exports.init = () => {
    globals.conn.on('init', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('init', data);
        }
    });

    globals.conn.on('advanced', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('advanced', data);
        }
    });

    globals.conn.on('connected', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('connected', data);
        }
    });

    globals.conn.on('notifyList', (data) => {
        if (globals.currentScreen === 'game') {
            // When the server has a bunch of notify actions to send,
            // it will send them all in one array
            for (const action of data) {
                globals.ui.handleMessage('notify', action);
            }
        }
    });

    globals.conn.on('notify', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('notify', data);
        }
    });

    globals.conn.on('action', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('action', data);
        }
    });

    globals.conn.on('spectators', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('spectators', data);
        }
    });

    globals.conn.on('clock', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('clock', data);
        }
    });

    globals.conn.on('note', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('note', data);
        }
    });

    globals.conn.on('notes', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('notes', data);
        }
    });

    globals.conn.on('replayLeader', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('replayLeader', data);
        }
    });

    globals.conn.on('replayTurn', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('replayTurn', data);
        }
    });

    globals.conn.on('replayIndicator', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('replayIndicator', data);
        }
    });

    globals.conn.on('replayMorph', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('replayMorph', data);
        }
    });

    globals.conn.on('replaySound', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('replaySound', data);
        }
    });

    globals.conn.on('boot', (data) => {
        if (globals.currentScreen === 'game') {
            globals.ui.handleMessage('boot', data);
        }
    });
};
