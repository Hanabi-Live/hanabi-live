// Sent when the user clicks on the "Spectate" button in the lobby
// (the client will send a "hello" message after getting "gameStart")
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
    // (users should see a "Spectate" button for shared replays)
    if (game.sharedReplay) {
        messages.joinSharedReplay.step1(socket, data);
        return;
    }

    // Add them to the spectators object
    game.spectators[socket.userID] = socket;
    notify.gameMemberChange(data);
    notify.gameSpectators(data);

    // Set their status
    socket.currentGame = data.gameID;
    socket.status = 'Spectating';
    notify.allUserChange(socket);

    // Send them a "gameStart" message
    notify.playerGameStart(socket);
};
