// Imports
const globals = require('./globals');
const logger = require('./logger');

exports.step1 = (socket, data) => {
    // Local variables
    let i;

    logger.info('globals.connectedUsers:');
    i = 1;
    for (const userID of Object.keys(globals.connectedUsers)) {
        logger.info(`${i}) ${userID} - ${globals.connectedUsers[userID].username}`);
        i += 1;
    }

    logger.info('globals.currentGames:');
    i = 1;
    for (const gameID of Object.keys(globals.currentGames)) {
        logger.info(`${i}) ${gameID} - ${globals.currentGames[gameID].name}`);
        i += 1;
    }
};
