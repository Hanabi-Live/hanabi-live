// Sent when the user clicks on the "Leave Game" button in the lobby
// "data" is empty

// Imports
const globals = require('../globals');
const logger = require('../logger');
const notify = require('../notify');

const step1 = (socket, data) => {
    // Local variables
    data.userID = socket.userID;
    data.gameID = socket.currentGame;

    /*
        Validation
    */

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

    // Validate that the player is joined to this table
    let index = -1;
    for (let i = 0; i < game.players.length; i++) {
        const player = game.players.length[i];
        if (player.userID === socket.userID) {
            index = i;
            break;
        }
    }
    if (index === -1) {
        logger.warn(`This player is not in game #${data.gameID}.`);
        data.reason = `You are not in game #${data.gameID}.`;
        notify.playerDenied(socket, data);
        return;
    }

    /*
        Leave
    */

    logger.info(`User "${socket.username}" left game: #${data.gameID} (${game.name})`);

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
        logger.info(`Ended game #${data.gameID} because everyone left.`);
        delete globals.currentGames[data.gameID];

        // Notify everyone that the table was deleted
        notify.allTableGone(data);
    }
};
