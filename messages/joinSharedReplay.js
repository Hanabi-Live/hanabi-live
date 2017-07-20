'use strict';

// The "join_shared_replay" message is not actually sent by the client;
// we just store the logic here for organizational purposes
// "data" example:
/*
    {
        table_id: 15103,
    }
*/

// Imports
const globals = require('../globals');
const logger  = require('../logger');
const notify  = require('../notify');

exports.step1 = function(socket, data) {
    // Local variables
    data.userID = socket.userID;
    data.gameID = data.table_id;

    // Validate that this table exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.warn(`messages.join was called for game #${data.gameID}, but it does not exist.`);
        data.reason = 'That table does not exist.';
        notify.playerDenied(socket, data);
        return;
    }

    let game = globals.currentSharedReplays[data.gameID];

    logger.info(`User "${socket.username}" joined shared replay: #${data.gameID}`);

    // Keep track of the user that joined
    game.players.push({
        userID: socket.userID,
        username: socket.username,
        present: true,
        socket: socket,
    });
    socket.status = 'Pre-Replay';
    socket.atTable = {
        id:         data.gameID,
        replay:     false,
        spectating: false,
    };

    // Let the client know they successfully joined the table
    socket.emit('message', {
        type: 'joined',
        resp: {
            table_id: data.gameID,
        },
    });

    notify.allUserChange(socket);
    notify.allTableChange(data);
    notify.gameMemberChange(data);
};
