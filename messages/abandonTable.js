'use strict';

// Sent when the user clicks the "X" button next to the table in the lobby
// "data" example:
/*
    {
        table_id: 594,
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
        logger.warn(`messages.join_table was called for game #${data.gameID}, but it does not exist.`);
        data.reason = 'That table does not exist.';
        notify.playerDenied(socket, data);
        return;
    }

    for (let player of game.players) {
        // Update their status
        player.socket.currentGame = -1;
        player.socket.status = 'Lobby';
        notify.allUserChange(player.socket);
    }

    // Boot the people in the game back to the lobby screen
    data.who = socket.username;
    notify.gameBoot(data);

    // Keep track of the game ending
    logger.info(`Game: #${data.gameID} (${game.name}) ended with a score of ${game.score}.`);
    delete globals.currentGames[data.gameID];

    // Notify everyone that the table was deleted
    notify.allTableGone(data);
};
