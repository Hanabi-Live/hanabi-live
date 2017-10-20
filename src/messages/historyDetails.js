// Sent when the user clicks on the "Compare Scores" button
// "data" example:
/*
    {
        gameID: 15103,
    }
*/

// Imports
const logger = require('../logger');
const models = require('../models');

exports.step1 = (socket, data) => {
    // Get information about all of the games played on this seed
    models.games.getAllDeals(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error(`models.games.getAllDeals failed: ${error}`);
        return;
    }

    for (const game of data.gameList) {
        socket.emit('message', {
            type: 'historyDetail',
            resp: {
                id: game.id,
                score: game.score,
                ts: game.ts,
                you: game.you,
            },
        });
    }
}
