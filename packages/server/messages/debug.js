// "data" is empty

// Imports
const logger = require('../logger');
const models = require('../models');

// Import the environment variables defined in the ".env" file
// (this has to be in every file that accesses any environment varaibles)
require('dotenv').config();

exports.step1 = (socket, data) => {
    // Get the IP of the client
    // (same as in the "login.js" file)
    let ip = socket.handshake.headers['x-forwarded-for'] || socket.request.connection.remoteAddress;
    if (ip.startsWith('::ffff:')) {
        // Chop off the useless prefix
        ip = ip.substr(7);
    }
    if (ip !== process.env.ADMIN_IP) {
        logger.info('A non-admin user tried to do a debug command, but was denied.');
        return;
    }

    logger.info('Starting debug function.');

    models.gameParticipants.debug(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error(`models.gameParticipants.debug failed: ${error}`);
        return;
    }

    logger.info('Finished debug function.');
}
