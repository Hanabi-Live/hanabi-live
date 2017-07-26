// Sent when the client clicks the "Create Game" button
// "data" example:
/*
    {
        name: "",
        max: 5,
        variant: 0,
        allow_spec: false,
        timed: false,
        reorder_cards: false,
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const models = require('../models');
const messages = require('../messages');
const notify = require('../notify');

// Perform some validation before creating the game
exports.step1 = (socket, data) => {
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
    } else if (!('reorder_cards' in data)) {
        logger.warn(`User "${data.username}" created a table without sending a "reorder_cards" value.`);
        data.reason = 'You must submit a value of "reorder_cards".';
        notify.playerDenied(socket, data);
        return;
    }

    // Make a default game name if they did not provide one
    if (data.name.length === 0) {
        data.name = `${socket.username}'s game`;
    }

    // Validate that the game name is not excessively long
    const maxLength = 35;
    if (data.name.length > maxLength) {
        logger.warn(`User "${data.username}" supplied an excessively long table name with a length of ${data.name.length}.`);
        data.reason = `The table name must be ${maxLength} characters or less.`;
        notify.playerDenied(socket, data);
        return;
    }

    // Create the table
    data.owner = socket.userID;
    models.games.create(socket, data, step2);
    // We could defer writing games to the database at all until they are
    // finished; however, we don't want to do that for several reasons:
    // 1) We can store it in "globals.currentGames" object using the unique ID
    //    from the database as the key, instead of having to come up with some
    //    other scheme
    // 2) We want the player's notes to persist into the replay; notes are tied
    //    to the game ID
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error(`models.games.create failed: ${error}`);
        return;
    }

    logger.info(`User "${socket.username}" created a new game: #${data.gameID} (${data.name})`);

    // Keep track of the current games
    globals.currentGames[data.gameID] = {
        actions: [],
        allow_spec: data.allow_spec,
        clue_num: 8,
        datetime_created: null,
        datetime_finished: null,
        deck: [],
        deckIndex: 0,
        discard_signal_outstanding: false, // This is for the "Reorder Cards" feature
        end_turn_num: null,
        max_players: data.max,
        name: data.name,
        owner: socket.userID,
        players: [],
        reorder_cards: data.reorder_cards,
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
}
