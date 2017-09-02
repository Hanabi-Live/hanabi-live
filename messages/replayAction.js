// Sent when the user performs an action in a shared replay
// (this is new functionality and not present in the vanilla Keldon server)
// "data" example:
/*
    {
        type: 0,
        // 0 is a turn change
        // 1 is a manual card order indication
        value: 10,
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
        notify.playerError(socket, data);
        return;
    }

    // Validate that this is a shared replay
    if (!game.sharedReplay) {
        logger.warn(`User "${socket.username}" tried to perform a replay action on non-replay replay game #${data.gameID}.`);
        data.reason = 'You can only perform replay actions in shared replays.';
        notify.playerError(socket, data);
        return;
    }

    // Validate that this person is leading the review
    if (socket.userID !== game.owner) {
        logger.warn(`User "${socket.username}" tried to perform an action on shared replay #${data.gameID}, but they were not the owner.`);
        data.reason = 'You are not the owner of this shared replay.';
        notify.playerError(socket, data);
        return;
    }

    // Validate type of message
    if (!Number.isInteger(data.type) || data.type < 0 || data.type > 1) {
        logger.warn(`User "${socket.username}" tried to perform an invalid replay action of type "${data.type}" on shared replay #${data.gameID}.`);
        data.reason = 'That is an invalid replay action type.';
        notify.playerError(socket, data);
        return;
    }

    // Validate numeric value
    if (!Number.isInteger(data.value) || data.value < 0) {
        logger.warn(`User "${socket.username}" tried to specify an invalid replay action with value "${data.value}" on shared replay #${data.gameID}.`);
        data.reason = 'That is an invalid replay action value.';
        notify.playerError(socket, data);
        return;
    }

    // Apply action

    // Change the current turn
    if (data.type === 0) {
        game.turnNum = data.value;
    }

    // Send message to everyone
    let msg;
    switch (data.type) {
        case 0:
            msg = {
                type: 'replayTurn',
                resp: {
                    turn: data.value,
                },
            };
            break;
        case 1:
            msg = {
                type: 'replayIndicator',
                resp: {
                    order: data.value,
                },
            };
            break;
    }

    for (const userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', msg);
    }
};
