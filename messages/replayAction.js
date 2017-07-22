// Sent when the user performs an action in a shared replay
// (this is new functionality and not present in the vanilla Keldon server)
// "data" example:
/*
    {
        type: 0,
        // 0 is a turn change
        // 1 is a mouse cursor move
        turn: 1, // Only sent if the type is 0
        cursor: { // Only sent if the type is 1
            x: 100,
            y: 100,
        },
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const notify = require('../notify');

exports.step1 = (socket, data) => {
    // Local variables
    data.gameID = socket.currentGame;

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

    // Validate that this is a shared replay
    if (!game.shared_replay) {
        logger.warn(`User "${socket.username}" tried to perform a replay action on non-replay replay game #${data.gameID}.`);
        data.reason = 'You can only perform replay actions in shared replays.';
        notify.playerDenied(socket, data);
        return;
    }

    // Validate that this person is leading the review
    if (socket.userID !== game.owner) {
        logger.warn(`User "${socket.username}" tried to perform an action on shared replay #${data.gameID}, but they were not the owner.`);
        data.reason = 'You are not the owner of this shared replay.';
        notify.playerDenied(socket, data);
        return;
    }

    // Change the current turn
    if (data.type === 0) {
        game.turn_num = data.turn;
    }

    // Send it to everyone
    for (const userID of Object.keys(game.spectators)) {
        let msg;
        if (data.type === 0) {
            msg = {
                type: 'replay_turn',
                resp: {
                    turn: data.turn,
                },
            };
        } else if (data.type === 1) {
            msg = {
                type: 'replay_mouse',
                resp: {
                    x: data.cursor.x,
                    y: data.cursor.y,
                },
            };
        } else {
            logger.warn(`User "${socket.username}" tried to perform an invalid replay action of type "${data.type}" on shared replay #${data.gameID}.`);
            data.reason = 'That is an inavlid replay action type.';
            notify.playerDenied(socket, data);
            return;
        }

        game.spectators[userID].emit('message', msg);
    }
};
