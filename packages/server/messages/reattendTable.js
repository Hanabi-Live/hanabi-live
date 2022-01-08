// Sent when the user clicks on the "Resume" button in the lobby
// "data" example:
/*
    {
        gameID: 31,
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
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

    // Validate that the player is joined to this table
    let index = -1;
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === socket.userID) {
            index = i;
            break;
        }
    }
    if (index === -1) {
        logger.warn(`This player is not in game #${data.gameID}.`);
        data.reason = `You are not in game #${data.gameID}.`;
        notify.playerError(socket, data);
        return;
    }

    // Set their "present" variable back to true, which will turn their name
    // from red to black (or remove the "AWAY" if the game has not started yet)
    game.players[index].present = true;
    if (game.running) {
        notify.gameConnected(data);
    } else {
        notify.gameMemberChange(data);
    }

    // Set their status
    if (game.running) {
        socket.status = 'Playing';
    } else {
        socket.status = 'Pre-Game';
    }
    notify.allUserChange(socket);

    // Let the client know they successfully joined the table
    socket.emit('message', {
        type: 'joined',
        resp: {
            gameID: data.gameID,
        },
    });

    // Make the client switch screens to show the game UI
    if (game.running) {
        notify.playerGameStart(socket);
    }
};
