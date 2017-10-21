// Sent when the user clicks on the "Join" button in the lobby
// "data" example:
/*
    {
        gameID: 15103,
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const models = require('../models');
const notify = require('../notify');

exports.step1 = (socket, data) => {
    // Local variables
    data.userID = socket.userID;

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
        notify.playerError(socket, data);
        return;
    }

    // Validate that the player is not already joined to this table
    let found = false;
    for (const player of game.players) {
        if (player.userID === socket.userID) {
            found = true;
            break;
        }
    }
    if (found) {
        logger.warn(`This player is already in game #${data.gameID}.`);
        data.reason = `You are already in game #${data.gameID}.`;
        notify.playerError(socket, data);
        return;
    }

    // Validate that the player is not joined to another game
    if (socket.currentGame !== -1) {
        data.reason = `You cannot join game #${data.gameID} because you are already in game #${socket.currentGame}.`;
        notify.playerError(socket, data);
        return;
    }

    // Validate that this table does not already have the 5 players
    if (game.players.length > 5) {
        logger.warn(`messages.join was called for game #${data.gameID}, but it has 5 players already.`);
        data.reason = 'You cannot join a table that already has 5 players.';
        notify.playerError(socket, data);
        return;
    }

    // Validate that the game is not started yet
    if (game.running) {
        logger.warn(`messages.join was called for game #${data.gameID}, but it was already started.`);
        data.reason = `Game #${data.gameID} is already started.`;
        notify.playerError(socket, data);
        return;
    }

    /*
        Join
    */

    logger.info(`User "${socket.username}" joined game: #${data.gameID} (${game.name})`);

    // Get the stats for this player
    data.socket = socket;
    models.users.getStats(data, step2);
};

function step2(error, data) {
    if (error !== null) {
        logger.error(`models.users.getStats failed: ${error}`);
        return;
    }

    // Local variables
    const game = globals.currentGames[data.gameID];

    // Keep track of the user that joined
    let time = globals.startingTime; // In milliseconds
    if (game.timed && game.name === '!test') {
        time = 10 * 1000; // 10 seconds for testing
    } else if (!game.timed) {
        // In non-timed games, start each player with 0 "time left"
        // It will decrement into negative numbers to show how much time they
        // are taking
        time = 0;
    }
    game.players.push({
        hand: [],
        userID: data.socket.userID,
        username: data.socket.username,
        present: true,
        socket: data.socket, // A reference to their socket object
        time,
        stats: {
            numPlayed: data.numPlayed,
            numPlayedVariant: data.numPlayedVariant,
            averageScoreVariant: data.averageScoreVariant,
            strikeoutRateVariant: data.strikeoutRateVariant,
        },
        notes: {}, // All of the player's notes, indexed by card order
    });
    notify.allTableChange(data);
    notify.gameMemberChange(data);

    // Set their status
    data.socket.currentGame = data.gameID;
    data.socket.status = 'Pre-Game';
    notify.allUserChange(data.socket);

    // Send them a "joined" message
    // (to let them know they successfully joined the table)
    data.socket.emit('message', {
        type: 'joined',
        resp: {
            gameID: data.gameID,
        },
    });
}
