// Sent when the user clicks on the "Compare Scores" button
// "data" example:
/*
    {
        id: 15103,
    }
*/

// Imports
const logger = require('../logger');
const models = require('../models');

exports.step1 = (socket, data) => {
    // Local variables
    data.gameID = data.id;

    // Get information about all of the games played on this seed
    models.games.getAllDeals(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.games.getAllDeals failed:', error);
        return;
    }

    for (const game of data.gameList) {
        socket.emit('message', {
            type: 'history_detail',
            resp: {
                id: game.id,
                score: game.score,
                ts: game.ts,
                you: game.you,
            },
        });
    }
}
