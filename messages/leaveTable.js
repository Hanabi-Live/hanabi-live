// Sent when the user clicks on the "Leave Game" button in the lobby
// "data" is empty

// Imports
const globals = require('../globals');
const logger = require('../logger');
const models = require('../models');
const notify = require('../notify');

const step1 = (socket, data) => {
    // Local variables
    data.userID = socket.userID;
    data.gameID = socket.currentGame;

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
    const game = globals.currentGames[data.gameID];

    logger.info(`User "${socket.username}" left game: #${data.gameID} (${game.name})`);

    // Find the index of this player
    let index;
    for (let i = 0; i < game.players.length; i++) {
        const player = game.players[i];
        if (player.userID === socket.userID) {
            index = i;
            break;
        }
    }

    // Keep track that the user left
    game.players.splice(index, 1);
    notify.allTableChange(data);
    notify.gameMemberChange(data);

    // Set their status
    socket.currentGame = -1;
    socket.status = 'Lobby';
    notify.allUserChange(socket);

    // Make the client switch screens to show the current table status
    socket.emit('message', {
        type: 'left',
    });

    // Force everyone else to leave if it was the owner that left
    if (socket.userID === game.owner) {
        for (const player of game.players) {
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
