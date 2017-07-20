'use strict';

// Sent when the user clicks on the "Watch Replay" button
// (the client will send a "hello" message after getting "game_start")
// "data" example:
/*
    {
        id: 15103,
    }
*/

// Imports
const logger = require('../logger');
const models = require('../models');
const notify = require('../notify');

exports.step1 = function(socket, data) {
    // Local variables
    data.gameID = data.id;

    // Validate that this game ID exists
    models.games.exists(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.games.exists failed:', error);
        return;
    }

    if (!data.exists) {
        logger.warn(`messages.start_replay was called for game #${data.gameID}, but it does not exist.`);
        data.reason = `Game #${data.gameID} does not exist.`;
        notify.playerDenied(socket, data);
        return;
    }

    // Set their status
    socket.status = 'Replay';
    notify.allUserChange(socket);

    // Set that they are watching a replay (on the server-side)
    socket.atTable = {
        id:         data.gameID,
        replay:     true,
        spectating: false,
    };

    // Send them a "game_start" message
    socket.emit('message', {
        type: 'game_start',
        resp: {
            replay: true,
        },
    });
}
