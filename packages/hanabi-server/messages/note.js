// Sent when the user writes a note
// (this is new functionality and not present in the vanilla Keldon server)
// "data" example:
/*
    {
        order: 3,
        note: 'b1,m1',
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

    // Validate that the game is started
    if (!game.running) {
        logger.warn(`messages.action was called for game #${data.gameID}, but it is not started yet.`);
        data.reason = `Game #${data.gameID} is not started.`;
        notify.playerError(socket, data);
        return;
    }

    // Get the index of this player
    data.index = -1;
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === socket.userID) {
            data.index = i;
            break;
        }
    }
    if (data.index === -1) {
        // We don't want to replicate notes from spectators
        return;
    }

    // Update the array that contains all of their notes
    if (data.note === '') {
        game.players[data.index].notes[data.order] = null;
    } else {
        game.players[data.index].notes[data.order] = data.note;
    }

    // Let all of the spectators know that there is a new note
    notify.spectatorsNote(data);
};
