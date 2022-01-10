// Sent when the client clicks the "Create Game" button
// "data" example:
/*
    {
        name: "",
        variant: 0,
        timed: false,
        reorderCards: false,
    }
*/

// Imports
const moment = require('moment');
const globals = require('../globals');
const logger = require('../logger');
const messages = require('../messages');
const notify = require('../notify');

// Perform some validation before creating the game
exports.step1 = (socket, data) => {
    // Validate that they submitted all of the required data
    if (!('name' in data)) {
        logger.warn(`User "${data.username}" created a table without sending a "name" value.`);
        data.reason = 'You must submit a value of "name".';
        notify.playerError(socket, data);
        return;
    } else if (!('variant' in data)) {
        logger.warn(`User "${data.username}" created a table without sending a "variant" value.`);
        data.reason = 'You must submit a value of "variant".';
        notify.playerError(socket, data);
        return;
    } else if (!('timed' in data)) {
        logger.warn(`User "${data.username}" created a table without sending a "timed" value.`);
        data.reason = 'You must submit a value of "timed".';
        notify.playerError(socket, data);
        return;
    } else if (!('reorderCards' in data)) {
        logger.warn(`User "${data.username}" created a table without sending a "reorderCards" value.`);
        data.reason = 'You must submit a value of "reorderCards".';
        notify.playerError(socket, data);
        return;
    }

    // Make a default game name if they did not provide one
    if (data.name.length === 0) {
        data.name = `${socket.username}'s game`;
    }

    // Validate that the game name is not excessively long
    const maxLength = 45;
    if (data.name.length > maxLength) {
        logger.warn(`User "${data.username}" supplied an excessively long table name with a length of ${data.name.length}.`);
        data.reason = `The table name must be ${maxLength} characters or less.`;
        notify.playerError(socket, data);
        return;
    }

    // Validate that the player is not joined to another game
    if (socket.currentGame !== -1) {
        data.reason = `You cannot create a new game because you are already in game #${socket.currentGame}.`;
        notify.playerError(socket, data);
        return;
    }

    /*
        Create
    */

    data.gameID = globals.id;
    globals.id += 1;
    logger.info(`User "${socket.username}" created a new game: #${data.gameID} (${data.name})`);

    // Use user-specified timer rules if they're "valid", otherwise defaults
    // N.B. "valid" is the minimum imaginable check: is not empty string and not isNaN
    //   (thanks to the joys of weak typing, empty string is considered a number)
    let baseTime = globals.baseTimeDefault;
    const specifiedBaseTimeMinutes = data.baseTimeMinutes;
    if (specifiedBaseTimeMinutes && !isNaN(specifiedBaseTimeMinutes)) {
        baseTime = specifiedBaseTimeMinutes * 60 * 1000;
    }
    let timePerTurn = globals.timePerTurnDefault;
    const specifiedTimePerTurnSeconds = data.timePerTurnSeconds;
    if (specifiedTimePerTurnSeconds && !isNaN(specifiedTimePerTurnSeconds)) {
        timePerTurn = specifiedTimePerTurnSeconds * 1000;
    }

    // Keep track of the current games
    globals.currentGames[data.gameID] = {
        actions: [],
        baseTime,
        clueNum: 8,
        datetimeCreated: moment().format('YYYY-MM-DD HH:mm:ss'), // This is the MariaDB format
        datetimeFinished: null,
        deck: [],
        deckIndex: 0,
        discardSignalOutstanding: false, // This is for the "Reorder Cards" feature
        discardSignalTurnExpiration: -1, // This is for the "Reorder Cards" feature
        endTurnNum: null,
        name: data.name,
        owner: socket.userID,
        players: [],
        progress: 0,
        reorderCards: data.reorderCards,
        running: false,
        score: 0,
        seed: null,
        sharedReplay: false,
        spectators: {},
        stacks: [],
        strikes: 0,
        sound: null,
        timed: data.timed,
        timePerTurn,
        turnBeginTime: null,
        turnNum: 0,
        turnPlayerIndex: 0,
        variant: data.variant,
    };

    notify.allTableChange(data);

    // Join the user to the new table
    messages.joinTable.step1(socket, data);
};
