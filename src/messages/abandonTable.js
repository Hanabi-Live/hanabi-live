// Sent when the user clicks the "X" button next to the table in the lobby
// "data" example:
/*
    {
        gameID: 594,
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const notify = require('../notify');
const messages = require('../messages');

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

    // End the game and write it to the database
    const text = `${socket.username} terminated the game.`;
    game.actions.push({
        text,
    });
    notify.gameAction(data);
    messages.endGame.step1(data);

    // Boot the people in the game back to the lobby screen
    data.who = socket.username;
    notify.gameBoot(data);
};
