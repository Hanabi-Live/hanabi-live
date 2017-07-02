'use strict';

// Sent when the client clicks the "Create Game" button
// "data" example:
/*
    {
        allow_spec: false,
        max: 5,
        name: "",
        variant: 0,
    }
*/

// Imports
const globals  = require('../globals');
const models   = require('../models');
const messages = require('../messages');

exports.step1 = function(socket, data) {
    // Prepare the data to feed to the model
    if (data.name === '') {
        data.name = socket.username + '\'s game';
    }
    data.timed = false;
    data.owner = socket.userID;

    // Create the table
    models.games.create(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        console.error('Error: models.games.create failed:', error);
        return;
    }

    console.log('User "' + socket.username + '" created a new game: #' + data.gameID + ' (' + data.name + ')');

    // Keep track of the current games
    globals.currentGames[data.gameID] = {
        actions: [],
        allow_spec: data.allow_spec,
        clue_num: 8,
        deck: [],
        deckIndex: 0,
        end_turn_num: null,
        max_players: data.max,
        name: data.name,
        num_spec: 0,
        owner: socket.userID,
        players: [],
        running: false,
        score: 0,
        seed: null,
        spectators: {},
        stacks: [],
        strikes: 0,
        timed: false,
        turn_num: 0,
        turn_player_index: 0,
        variant: data.variant,
    };

    messages.join_table.notifyAllTableChange(data);

    // Join the user to the new table
    data.table_id = data.gameID;
    messages.join_table.step1(socket, data);
}
