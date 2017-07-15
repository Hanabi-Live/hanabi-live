'use strict';

// Sent when the client clicks the "Create Game" button
// "data" example:
/*
    {
        name: "",
        max: 5,
        variant: 0,
        allow_spec: false,
        enable_timer: false,
    }
*/

// Imports
const globals  = require('../globals');
const logger   = require('../logger');
const models   = require('../models');
const messages = require('../messages');
const notify   = require('../notify');

exports.step1 = function(socket, data) {
    // Prepare the data to feed to the model
    if (data.name === '') {
        data.name = socket.username + '\'s game';
    }
    data.timed = false;
    data.owner = socket.userID;

    // Validate that the game name is not longer than 100 characters
    if (data.name.length > 100) {
        return;
    }

    // Create the table
    models.games.create(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.games.create failed:', error);
        return;
    }

    logger.info('User "' + socket.username + '" created a new game: #' + data.gameID + ' (' + data.name + ')');

    // Keep track of the current games
    globals.currentGames[data.gameID] = {
        actions:           [],
        allow_spec:        data.allow_spec,
        clue_num:          8,
        deck:              [],
        deckIndex:         0,
        end_turn_num:      null,
        max_players:       data.max,
        name:              data.name,
        num_spec:          0,
        owner:             socket.userID,
        players:           [],
        running:           false,
        score:             0,
        seed:              null,
        spectators:        {},
        stacks:            [],
        strikes:           0,
        sound:             null,
        timed:             data.enable_timer,
        turn_begin_time:   null,
        turn_num:          0,
        turn_player_index: 0,
        variant:           data.variant,
    };

    notify.allTableChange(data);

    // Join the user to the new table
    data.table_id = data.gameID;
    messages.join_table.step1(socket, data);
}
