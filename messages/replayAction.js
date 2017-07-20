'use strict';

// Sent when the user performs an action in a shared replay
// (this is new functionality and not present in the vanilla Keldon server)
// "data" example:
/*
    {
        type: 1,
        // 0 is rewind to the beginning (the left-most button)
        // 1 is rewind 1 turn (the 2nd left-most button)
        // 2 is advance 1 turn (the 2nd right-most button)
        // 3 is advance to the end (the right-most button)
        // 4 is a mouse cursor move
        coords: { // Only sent if the type is 5
            x: 100,
            y: 100,
        },
    }
*/

// Imports
const globals  = require('../globals');
const logger   = require('../logger');
const notify   = require('../notify');
//const messages = require('../messages');

exports.step1 = function(socket, data) {
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

    // Validate that this person is leading the review
    // TODO

    // Add this action to the replay action stack
    game.replayActions.push(data);

    // Send it to everyone
    let replayActionMsg = {
        type: 'replay_action',
        resp: data,
    };
    for (let userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', replayActionMsg);
    }
};
