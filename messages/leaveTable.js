'use strict';

// Sent when the user clicks on the "Leave Game" button in the lobby
// "data" is empty

// Imports
const globals = require('../globals');
const logger  = require('../logger');
const models  = require('../models');
const notify  = require('../notify');

const step1 = function(socket, data) {
    // Local variables
    data.userID = socket.userID;
    data.gameID = socket.atTable.id;

    // Validate that this table exists
    if (!(data.gameID in globals.currentGames)) {
        return;
    }

    // Leave the table
    models.gameParticipants.delete(socket, data, step2);
};
exports.step1 = step1;

function step2(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.gameParticipants.delete failed:', error);
        return;
    }

    // Local variables
    let game = globals.currentGames[data.gameID];

    logger.info(`User "${socket.username}" left game: #${data.gameID} (${game.name})`);

    // Find the index of this player
    let index;
    for (let i = 0; i < game.players.length; i++) {
        let player = game.players[i];
        if (player.userID === socket.userID) {
            index = i;
            break;
        }
    }

    // Keep track that the user left
    game.players.splice(index, 1);
    socket.status = 'Lobby';
    socket.atTable = {
        id:         -1,
        replay:     false,
        spectating: false,
    };

    // Make the client switch screens to show the current table status
    socket.emit('message', {
        type: 'left',
    });

    notify.allUserChange(socket);
    notify.allTableChange(data);
    notify.gameMemberChange(data);

    // Force everyone else to leave if it was the owner that left
    if (socket.userID === game.owner) {
        for (let player of game.players) {
            step1(player.socket, data);
        }
    }

    // Delete the game if there is no-one left
    if (game.players.length === 0) {
        models.games.delete(socket, data, step3);
    }
}

function step3(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.games.delete failed:', error);
        return;
    }

    // Keep track of the game ending
    logger.info(`Ended game #${data.gameID} because everyone left.`);
    delete globals.currentGames[data.gameID];

    // Notify everyone that the table was deleted
    notify.allTableGone(data);
}
