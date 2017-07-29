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
const messages = require('../messages');
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

    // The logic for joining shared replay is in a separate file for
    // organizational purposes
    // (users should see a "Spectate" button for shared replays and not a "Join
    // Game" button, so this code block should never execute; keep it here just
    // in case)
    if (game.sharedReplay) {
        messages.joinSharedReplay.step1(socket, data);
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

    /*
        Join
    */

    logger.info(`User "${socket.username}" joined game: #${data.gameID} (${game.name})`);

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
        userID: socket.userID,
        username: socket.username,
        present: true,
        socket,
        time,
        notes: {}, // All of the player's notes, indexed by card order
    });
    notify.allTableChange(data);
    notify.gameMemberChange(data);

    // Set their status
    socket.currentGame = data.gameID;
    socket.status = 'Pre-Game';
    notify.allUserChange(socket);

    // Send them a "joined" message
    // (to let them know they successfully joined the table)
    socket.emit('message', {
        type: 'joined',
        resp: {
            gameID: data.gameID,
        },
    });
};
