/*
    WebSocket command handlers for in-game events
*/

const globals = require('../globals');

exports.init = () => {
    globals.conn.on('message', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('message', data);
        }
    });

    globals.conn.on('init', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('init', data);
        }
    });

    globals.conn.on('advanced', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('advanced', data);
        }
    });

    globals.conn.on('connected', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('connected', data);
        }
    });

    globals.conn.on('notifyList', (data) => {
        if (globals.currentScreen === 'game') {
            // When the server has a bunch of notify actions to send, it will send them all in one array
            for (const action of data) {
                if (action.type === '') {
                    // self.ui.handleMessage('message', action);
                } else {
                    // self.ui.handleMessage('notify', action);
                }
            }
        }
    });

    globals.conn.on('notify', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('notify', data);
        }
    });

    globals.conn.on('action', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('action', data);
        }
    });

    globals.conn.on('spectators', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('spectators', data);
        }
    });

    globals.conn.on('clock', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('clock', data);
        }
    });

    globals.conn.on('note', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('note', data);
        }
    });

    globals.conn.on('notes', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('notes', data);
        }
    });

    globals.conn.on('replayLeader', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('replayLeader', data);
        }
    });

    globals.conn.on('replayTurn', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('replayTurn', data);
        }
    });

    globals.conn.on('replayIndicator', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('replayIndicator', data);
        }
    });

    globals.conn.on('boot', (data) => {
        if (globals.currentScreen === 'game') {
            // self.ui.handleMessage('boot', data);
        }
    });
};
