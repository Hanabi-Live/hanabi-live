'use strict';

// Sent when the user clicks on the "Shared Replay" button
// (this is new functionality and not present in the vanilla Keldon server)
// "data" example:
/*
    {
        id: 123,
    }
*/

// Imports
const globals  = require('../globals');
const logger   = require('../logger');
const messages = require('../messages');
const notify   = require('../notify');

exports.step1 = function(socket, data) {
    // Prepare the data to feed to the model
    data.gameID = data.id;
    data.owner = socket.userID;
    data.name = `Shared replay for game #${data.id}`;

    // Validate that this game ID exists in the database
    // TODO

    logger.info(`User "${socket.username}" created a new shared replay: #${data.gameID}`);

    // Keep track of the current games
    globals.currentGames[data.gameID] = {
        name:          'Shared replay for game #' + data.gameID,
        owner:         socket.userID,
        players:       [],
        spectators:    [],
        running:       false,
        shared_replay: true,
    };

    notify.allTableChange(data);

    // Join the user to the new table
    data.table_id = data.gameID;
    messages.join_table.step1(socket, data);
};
