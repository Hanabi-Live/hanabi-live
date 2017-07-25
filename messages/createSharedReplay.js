// Sent when the user clicks on the "Shared Replay" button
// (this is new functionality and not present in the vanilla Keldon server)
// "data" example:
/*
    {
        id: 123,
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const models = require('../models');
const messages = require('../messages');
const notify = require('../notify');

exports.step1 = (socket, data) => {
    // Validate that there is not a shared replay for this game ID already
    data.gameID = data.id;
    if (data.gameID in globals.currentGames) {
        data.reason = 'There is already a shared replay going on for that ID.';
        notify.playerDenied(socket, data);
        return;
    }

    // Validate that this game ID exists in the database
    models.games.getVariant(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error(`models.games.getVariant failed: ${error}`);
        return;
    }

    if (data.variant === null) {
        logger.warn(`User "${socket.username}" requested to start a shared replay for game #${data.gameID}, which does not exist.`);
        data.reason = 'That game ID does not exist.';
        notify.playerDenied(socket, data);
    }

    logger.info(`User "${socket.username}" created a new shared replay: #${data.gameID}`);

    // Define a standard naming scheme for shared replays
    const name = `${socket.username}'s shared replay`;

    // Keep track of the current games
    globals.currentGames[data.gameID] = {
        name,
        owner: socket.userID,
        players: [],
        spectators: [],
        variant: data.variant,
        running: true,
        turn_num: 0,
        shared_replay: true,
        leader: socket.username,
    };

    notify.allTableChange(data);

    // Join the user to the new table
    data.table_id = data.gameID;
    messages.join_shared_replay.step1(socket, data);
}
