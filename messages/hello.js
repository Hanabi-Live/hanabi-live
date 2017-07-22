// Sent when the user:
// - is in a game that is starting
// - joins a game that has already started
// - starts a replay
// - starts spectating a game
// This is sent before the UI is initialized; the client will send a "ready"
// message later to get more data
// "data" is empty

// Imports
const globals = require('../globals');
const logger = require('../logger');
const models = require('../models');

exports.step1 = (socket, data) => {
    // Local variables
    data.gameID = socket.currentGame;

    if (socket.status === 'Replay' || socket.status === 'Shared Replay') {
        models.games.getVariantPlayers(socket, data, step2);
    } else {
        data.game = globals.currentGames[data.gameID];
        step2(null, socket, data);
    }
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.games.getVariantPlayers failed:', error);
        return;
    }

    // This is either from "globals.currentGames" or built by the database
    const game = data.game;

    // Create a list of names of the users in this game
    const names = [];
    for (const player of game.players) {
        names.push(player.username);
    }

    // Find out what seat number (index) this user is sitting in
    let seat = 0; // By default, assume a seat of 0
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === socket.userID) {
            seat = i;
            break;
        }
    }
    // If this is a replay of a game they were not in or they are spectating
    // the game, the above if statement will never be reached, and they will be
    // in seat 0

    // Give them an "init" message
    socket.emit('message', {
        type: 'init',
        resp: {
            names,
            replay: (socket.status === 'Replay' || socket.status === 'Shared Replay'),
            seat,
            spectating: (socket.status === 'Spectating'),
            timed: game.timed,
            variant: game.variant,
            shared_replay: (socket.status === 'Shared Replay'),
        },
    });
}
