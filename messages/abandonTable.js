'use strict';

// Sent when the user clicks the "X" button next to the table in the lobby
// "data" example:
/*
    {
        table_id: 594,
    }
*/

// Imports
const globals  = require('../globals');
const logger   = require('../logger');
const notify   = require('../notify');

exports.step1 = function(socket, data) {
    // Local variables
    data.gameID = data.table_id;
    let game = globals.currentGames[data.gameID];

    // Validate that this table exists
    if (data.gameID in globals.currentGames === false) {
        logger.info("(Table does not exist.)");
        return;
    }

    // Update everyone's "Seated" and "Playing" values
    for (let player of game.players) {
        player.socket.seated = false;
        player.socket.playing = false;
        player.socket.atTable = {
            id:         -1,
            replay:     false,
            spectating: false,
        };
        notify.allUserChange(player.socket);
    }

    // Boot the people in the game back to the lobby screen
    data.who = socket.username;
    notify.gameBoot(data);

    // Keep track of the game ending
    logger.info('Game: #' + data.gameID + ' (' + game.name + ') ended with a score of ' + game.score + '.');
    delete globals.currentGames[data.gameID];

    // Notify everyone that the table was deleted
    notify.allTableGone(data);
};
