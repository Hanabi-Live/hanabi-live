// Sent when the owner of a table clicks on the "Start Game" button
// (the client will send a "hello" message after getting "gameStart")
// "data" is empty

// Imports
const seedrandom = require('seedrandom');
const moment = require('moment');
const globals = require('../globals');
const logger = require('../logger');
const models = require('../models');
const messages = require('../messages');
const notify = require('../notify');

// "data" contains nothing
exports.step1 = (socket, data) => {
    // Local variables
    data.gameID = socket.currentGame;
    const game = globals.currentGames[data.gameID];

    // Create the deck
    const suits = [0, 1, 2, 3, 4];
    if (game.variant > 0) {
        suits.push(5);
    }
    for (const suit of suits) {
        const ranks = [1, 2, 3, 4, 5];
        for (const rank of ranks) {
            let amountToAdd;
            if (suit === 5 && game.variant === 2) {
                // Black one of each
                amountToAdd = 1;
            } else if (rank === 1) {
                amountToAdd = 3;
            } else if (rank === 5) {
                amountToAdd = 1;
            } else {
                amountToAdd = 2;
            }

            for (let i = 0; i < amountToAdd; i++) {
                // Each card will have an array of notes, based on the note
                // that each player has added to it
                const notes = [];
                for (let j = 0; j < game.players.length; j++) {
                    notes.push('');
                }

                // Add the card to the deck
                game.deck.push({
                    suit,
                    rank,
                    touched: false,
                    discarded: false,
                    notes,
                    // We can't set the order here because the deck will be
                    // shuffled later
                });
            }
        }
    }

    // Create the stacks
    for (let i = 0; i < suits.length; i++) {
        game.stacks.push(0);
    }

    const m = game.name.match(/^!seed (\d+)$/);
    if (m) {
        // Parse the game name to see if the players want to play a specific seed
        const seed = m[1];
        const seedPrefix = `p${game.players.length}v${game.variant}s`;
        game.seed = seedPrefix + seed;
        step3(socket, data);
        // We skip step 2 because we do not have to find an unplayed seed
    } else {
        // Get a list of all the seeds that these players have played before
        data.playerIndex = -1;
        data.seeds = {};
        step2(null, socket, data);
    }
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error(`models.games.getPlayerSeeds failed: ${error}`);
        return;
    }

    // Local variables
    const game = globals.currentGames[data.gameID];

    data.playerIndex += 1;
    if (data.playerIndex < game.players.length) {
        data.userID = game.players[data.playerIndex].userID;
        models.games.getPlayerSeeds(socket, data, step2);
        return;
    }

    // Find a seed that no-one has played before
    const seedPrefix = `p${game.players.length}v${game.variant}s`;
    let seedNum = 0;
    do {
        seedNum += 1;
        data.seed = seedPrefix + seedNum;
    } while (data.seed in data.seeds);

    // Set the new seed in the game object
    game.seed = data.seed;
    step3(socket, data);
}

function step3(socket, data) {
    // Local variables
    const game = globals.currentGames[data.gameID];

    logger.info(`Using seed ${game.seed}, allowSpec is ${game.allowSpec}, timed is ${game.timed}.`);

    // Shuffle the deck
    seedrandom(game.seed, {
        global: true, // So that it applies to "Math.random()"
    });
    shuffle(game.deck);

    // Log the deal (so that it can be distributed to others if necessary)
    logger.info('------------------------------');
    logger.info(`Deal for seed: ${game.seed} (from top to bottom)`);
    logger.info('(cards are dealt to a player until their hand fills up before moving on to the next one)');
    for (let i = 0; i < game.deck.length; i++) {
        const card = game.deck[i];
        data.target = i; // The "getSuitText" needs this
        const suitText = messages.action.getSuitText(data);
        logger.info(`${i + 1}) ${suitText} ${card.rank}`);
    }
    logger.info('------------------------------');

    // Deal the cards
    let handSize = 5;
    if (game.players.length > 3) {
        handSize = 4;
    }
    for (let i = 0; i < game.players.length; i++) {
        for (let j = 0; j < handSize; j++) {
            data.index = i;
            messages.action.playerDrawCard(data);
        }
    }

    // Get a random player to start first
    data.startingPlayerIndex = Math.floor(Math.random() * game.players.length);
    game.turnPlayerIndex = data.startingPlayerIndex; // Keep track of whose turn it is
    const text = `${game.players[data.startingPlayerIndex].username} goes first`;
    game.actions.push({
        text,
    });
    game.actions.push({
        num: 0,
        type: 'turn',
        who: data.startingPlayerIndex,
    });
    logger.info(`[Game ${data.gameID}] ${text}`);

    // Set the game to running
    game.running = true;
    game.datetimeStarted = moment().format('YYYY-MM-DD HH:mm:ss'); // This is the MariaDB format

    // Send a "gameStart" message to everyone in the game
    for (const player of game.players) {
        notify.playerGameStart(player.socket);
    }

    if (game.allowSpec) {
        // Let everyone know that the game has started, which will turn the
        // "Join Game" button into "Spectate"
        notify.allTableChange(data);
    } else {
        // Notify everyone that the table was deleted
        // (even the people in the game; they will get a new "table"
        // message shortly)
        notify.allTableGone(data);
    }

    // Set the status for all of the users in the game
    for (const player of game.players) {
        player.socket.status = 'Playing';
        notify.allUserChange(player.socket);
    }

    // Start the timer
    game.turnBeginTime = (new Date()).getTime();
    if (game.timed) {
        data.userID = game.players[data.startingPlayerIndex].userID;
        data.turnNum = 0;
        setTimeout(() => {
            messages.action.checkTimer(data);
        }, game.players[data.startingPlayerIndex].time);
    }

    // Send the list of people who are connected
    // (this governs if a player's name is red or not)
    notify.gameConnected(data);

    // Make a sound effect
    notify.gameSound(data);
}

/*
    Shuffles array in place. ES6 version
    @param {Array} a items The array containing the items.
    From: https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array
*/
function shuffle(a) {
    for (let i = a.length; i; i--) {
        const j = Math.floor(Math.random() * i);
        [a[i - 1], a[j]] = [a[j], a[i - 1]];
    }
}
