// Sent when the client clicks the "Create Game" button
// "data" example:
/*
    {
        name: "",
        max: 5,
        variant: 0,
        allow_spec: false,
        timed: false,
    }
*/

// Imports
const moment = require('moment');
const globals = require('../globals');
const logger = require('../logger');
const messages = require('../messages');
const notify = require('../notify');

exports.step1 = (socket, data) => {
    /*
        Validation
    */

    // Validate that they submitted all of the required data
    if (!('name' in data)) {
        logger.warn(`User "${data.username}" created a table without sending a "name" value.`);
        data.reason = 'You must submit a value of "name".';
        notify.playerDenied(socket, data);
        return;
    } else if (!('max' in data)) {
        logger.warn(`User "${data.username}" created a table without sending a "max" value.`);
        data.reason = 'You must submit a value of "max".';
        notify.playerDenied(socket, data);
        return;
    } else if (!('variant' in data)) {
        logger.warn(`User "${data.username}" created a table without sending a "variant" value.`);
        data.reason = 'You must submit a value of "variant".';
        notify.playerDenied(socket, data);
        return;
    } else if (!('allow_spec' in data)) {
        logger.warn(`User "${data.username}" created a table without sending a "allow_spec" value.`);
        data.reason = 'You must submit a value of "allow_spec".';
        notify.playerDenied(socket, data);
        return;
    } else if (!('timed' in data)) {
        logger.warn(`User "${data.username}" created a table without sending a "timed" value.`);
        data.reason = 'You must submit a value of "timed".';
        notify.playerDenied(socket, data);
        return;
    }

    // Make a default game name if they did not provide one
    if (data.name.length === 0) {
        data.name = `${socket.username}'s game`;
    }

    // Validate that the game name is not excessively long
    const maxLength = 30;
    if (data.name.length > maxLength) {
        logger.warn(`User "${data.username}" supplied an excessively long table name with a length of ${data.name.length}.`);
        data.reason = `The table name must be ${maxLength} characters or less.`;
        notify.playerDenied(socket, data);
        return;
    }

    /*
        Creation
    */

    logger.info(`User "${socket.username}" created a new game: #${data.gameID} (${data.name})`);

    // Keep track of the current games
    globals.currentGames[data.gameID] = {
        actions: [],
        allow_spec: data.allow_spec,
        clue_num: 8,
        datetime_created: null,
        datetime_finished: null,
        datetime_started: moment().format('YYYY-MM-DD HH:mm:ss'), // This is the MariaDB format
        deck: [],
        deckIndex: 0,
        end_turn_num: null,
        max_players: data.max,
        name: data.name,
        owner: socket.userID,
        players: [],
        running: false,
        score: 0,
        seed: null,
        shared_replay: false,
        spectators: {},
        stacks: [],
        strikes: 0,
        sound: null,
        timed: data.timed,
        turn_begin_time: null,
        turn_num: 0,
        turn_player_index: 0,
        variant: data.variant,
    };

    notify.allTableChange(data);

    // Join the user to the new table
    data.table_id = data.gameID;
    messages.join_table.step1(socket, data);
};
