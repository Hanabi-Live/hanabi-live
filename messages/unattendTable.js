'use strict';

// Sent when the user clicks on the "Lobby" button while they are in the middle
// of a game
// "data" is empty

// Imports
const globals = require('../globals');
const logger  = require('../logger');
const notify  = require('../notify');

exports.step1 = function(socket, data) {
    // Local variables
    data.gameID = socket.atTable.id;

    // Set their status
    socket.status = 'Lobby';
    notify.allUserChange(socket);

    // Validate that this table exists
    if (!(data.gameID in globals.currentGames)) {
        // Since games are deleted when they end, it is normal behavior for
        // players to click the "Lobby" button and get to this point
        logger.info("(Table does not exist.)");
        return;
    }
    let game = globals.currentGames[data.gameID];

    // Check to see if they are a spectator
    if (socket.atTable.spectating) {
        if (!(socket.userID in game.spectators)) {
            logger.error(`User "${socket.username}" tried to unattend game #${data.gameID}, but they were not in the spectators list.`);
            return;
        }

        delete game.spectators[socket.userID];
        game.num_spec--;
        notify.gameMemberChange(data);
        notify.gameNumSpec(data);
        return;
    }

    // Set their "present" variable to false, which will turn their name red
    // (or set them to "AWAY" if the game has not started yet)
    for (let player of game.players) {
        if (player.userID === socket.userID) {
            player.present = false;
            break;
        }
    }
    if (game.running) {
        notify.gameConnected(data);
    } else {
        notify.gameMemberChange(data);
    }

    // They got sent a "table_gone" message earlier (if the game started), so
    // send them a new table message
    notify.playerTable(socket, data);
};
