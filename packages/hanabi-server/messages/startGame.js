// Sent when the owner of a table clicks on the "Start Game" button
// (the client will send a "hello" message after getting "gameStart")
// "data" is empty

// Imports
const fs = require('fs');
const path = require('path');
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

    // Validate that this table exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.warn(`Game #${data.gameID} does not exist.`);
        data.reason = `Game #${data.gameID} does not exist.`;
        notify.playerError(socket, data);
        return;
    }

    // Validate that the game has at least 2 players
    if (game.players.length < 2) {
        logger.warn(`messages.startGame was called for game #${data.gameID}, but it does not have at least 2 players.`);
        data.reason = 'You need at least 2 players to start a game.';
        notify.playerError(socket, data);
        return;
    }

    // Validate that the game is not started yet
    if (game.running) {
        logger.warn(`messages.startGame was called for game #${data.gameID}, but it was already started.`);
        data.reason = `Game #${data.gameID} is already started.`;
        notify.playerError(socket, data);
        return;
    }

    // Create the deck
    // (it will have 60 cards if playing no variant,
    // 65 cards if playing a one of each variant,
    // and 70 cards when playing the other variants)
    const suits = [0, 1, 2, 3, 4];
    if (game.variant > 0) {
        suits.push(5);
    }
    for (const suit of suits) {
        const ranks = [1, 2, 3, 4, 5];
        for (const rank of ranks) {
            let amountToAdd;
            if (suit === 5 && (game.variant === 2 || game.variant === 7)) {
                // Black one of each or Crazy (which includes black one of each)
                amountToAdd = 1;
            } else if (rank === 1) {
                amountToAdd = 3;
            } else if (rank === 5) {
                amountToAdd = 1;
            } else {
                amountToAdd = 2;
            }

            for (let i = 0; i < amountToAdd; i++) {
                // Add the card to the deck
                game.deck.push({
                    suit,
                    rank,
                    touched: false,
                    discarded: false,
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

    // Check to see if this is a game with a preset deal
    data.shuffle = true;
    const m = game.name.match(/^!preset (.+)$/);
    if (m) {
        // Parse the game name to see the specific preset deal that they want
        const preset = m[1];
        const gameFilePath = path.join(__dirname, '..', '..', 'specific-deals', `${preset}.txt`);
        try {
            if (fs.existsSync(gameFilePath)) {
                // Read the file
                logger.info(`Using a preset deal of: ${preset}`);
                const gameFile = fs.readFileSync(gameFilePath, 'utf8').split('\n');
                for (let i = 0; i < gameFile.length; i++) {
                    const line = gameFile[i];
                    if (line === '') {
                        continue;
                    }
                    const m2 = line.match(/^(\w)(\d)$/);
                    if (m2) {
                        // Change the suit of all of the cards in the deck
                        let suit = m2[1];
                        if (suit === 'b') {
                            suit = 0;
                        } else if (suit === 'g') {
                            suit = 1;
                        } else if (suit === 'y') {
                            suit = 2;
                        } else if (suit === 'r') {
                            suit = 3;
                        } else if (suit === 'p') {
                            suit = 4;
                        } else if (suit === 'm') {
                            suit = 5;
                        } else {
                            logger.error(`Failed to parse the suit on line ${i}: ${suit}`);
                            break;
                        }
                        game.deck[i].suit = suit;

                        // Change the rank of all of the cards in the deck
                        const rank = m2[2];
                        game.deck[i].rank = Number.parseInt(rank, 10);
                    } else {
                        logger.error(`Failed to parse line ${i}: ${line}`);
                        break;
                    }
                }

                data.shuffle = false;
                game.seed = preset;
                step3(socket, data);
                // We skip step 2 because we do not have to find an unplayed seed
                return; // We can skip the rest of this function
            }
        } catch (err) {
            logger.error(`Failed to read the "${gameFilePath}" file: ${err}`);
        }
    }

    const m2 = game.name.match(/^!seed (.+)$/);
    if (m2) {
        // Parse the game name to see if the players want to play a specific seed
        const seed = m2[1];
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

    logger.info(`Using seed ${game.seed}, timed is ${game.timed}, reorderCards is ${game.reorderCards}.`);

    // Shuffle the deck
    if (data.shuffle) {
        seedrandom(game.seed, {
            global: true, // So that it applies to "Math.random()"
        });
        shuffle(game.deck);
    }

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

    if (data.shuffle) {
        // Get a random player to start first
        data.startingPlayerIndex = Math.floor(Math.random() * game.players.length);
    } else {
        // Set the starting player to be an arbitrary position that matches how the intended game should be played out
        data.startingPlayerIndex = game.players.length - 1;
    }
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

    // Let everyone know that the game has started, which will turn the
    // "Join Game" button into "Spectate"
    notify.allTableChange(data);

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
