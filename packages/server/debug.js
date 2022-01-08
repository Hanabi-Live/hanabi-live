// Imports
const globals = require('./globals');
const logger = require('./logger');

exports.step1 = (socket, data) => {
    logger.info('globals.connectedUsers:');
    if (Object.keys(globals.connectedUsers).length === 0) {
        logger.info('n/a - No users connected.');
    } else {
        let i = 1;
        for (const userID of Object.keys(globals.connectedUsers)) {
            logger.info(`${i}) ${userID} - ${globals.connectedUsers[userID].username}`);
            i += 1;
        }
    }

    logger.info('globals.currentGames:');
    if (Object.keys(globals.currentGames).length === 0) {
        logger.info('n/a - No games created.');
    } else {
        let i = 1;
        for (const gameID of Object.keys(globals.currentGames)) {
            logger.info(`${i}) ${gameID} - ${globals.currentGames[gameID].name}`);
            i += 1;
        }
    }
};
