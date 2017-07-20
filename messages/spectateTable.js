'use strict';

// Sent when the user clicks on the "Spectate" button in the lobby
// (the client will send a "hello" message after getting "game_start")
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
    data.gameID = data.table_id;

    // Validate that this table exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.warn(`Game #${data.gameID} does not exist.`);
        data.reason = `Game #${data.gameID} does not exist.`;
        notify.playerDenied(socket, data);
        return;
    }

    // Add them to the spectators object
    game.spectators[socket.userID] = socket;
    notify.gameMemberChange(data);
    notify.gameNumSpec(data);

    // Set their status
    socket.currentGame = data.gameID;
    socket.status = 'Spectating';
    notify.allUserChange(socket);

    // Send them a "game_start" message
    notify.playerGameStart(socket);
};
