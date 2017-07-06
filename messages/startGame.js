'use strict';

// Sent when the owner of a table clicks on the "Start Game" button
// (the client will send a "hello" message after getting "game_start")
// "data" is empty

// Imports
const seedrandom = require('seedrandom');
const globals    = require('../globals');
const logger     = require('../logger');
const models     = require('../models');
const messages   = require('../messages');
const notify     = require('../notify');

// "data" contains nothing
exports.step1 = function(socket, data) {
    // Local variables
    data.gameID = socket.atTable.id;
    let game = globals.currentGames[data.gameID];

    // Create the deck
    let suits = [0, 1, 2, 3, 4];
    if (game.variant > 0) {
        suits.push(5);
    }
    for (let suit of suits) {
        let ranks = [1, 2, 3, 4, 5];
        for (let rank of ranks) {
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
                game.deck.push({
                    suit: suit,
                    rank: rank,
                    order: i,
                });
            }
        }
    }

    // Create the stacks
    for (let i = 0; i < suits.length; i++) {
        game.stacks.push(0);
    }

    // Get a list of all the seeds that these players have played before
    data.playerIndex = -1;
    data.seeds = {};
    step2(null, socket, data);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.gameParticipants.getSeeds failed:', error);
        return;
    }

    // Local variables
    let game = globals.currentGames[data.gameID];
    data.playerIndex++;
    if (data.playerIndex < game.players.length) {
        data.userID = game.players[data.playerIndex].userID;
        models.gameParticipants.getSeeds(socket, data, step2);
        return;
    }

    // Find a seed that no-one has played before
    let seedPrefix = 'p' + game.players.length + 'v' + game.variant + 's';
    let seedNum = 1;
    while (true) {
        data.seed = seedPrefix + seedNum;
        if (data.seed in data.seeds === false) {
            break;
        }
        seedNum++;
    }

    // Set the new seed in the game object
    game.seed = data.seed;
    logger.info('Using seed "' + game.seed + '", allow_spec is ' + game.allow_spec + ', timed is ' + game.timed + '.');

    // Shuffle the deck
    seedrandom(game.seed, {
        global: true, // So that it applies to "Math.random()"
    });
    shuffle(game.deck);

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
    game.turn_player_index = data.startingPlayerIndex; // Keep track of whose turn it is
    let text = game.players[data.startingPlayerIndex].username + ' goes first';
    game.actions.push({
        text: text,
    });
    game.actions.push({
        num: 0,
        type: 'turn',
        who: data.startingPlayerIndex,
    });
    logger.info('[Game ' + data.gameID + '] ' + text);

    // Set the game to running
    game.running = true;

    // Start the game in the database (which sets the "status", "seed", and "datetime_started" columns)
    models.games.start(socket, data, step3);
}

function step3(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.games.start failed:', error);
        return;
    }

    // Local variables
    let game = globals.currentGames[data.gameID];

    // Send a "game_start" message to everyone in the game
    for (let player of game.players) {
        player.socket.emit('message', {
            type: 'game_start',
            resp: {
                replay: false,
            },
        });
    }

    if (game.allow_spec) {
        // Let everyone know that the game has started, which will turn the "Join Game" button into "Spectate"
        notify.allTableChange(data);
    } else {
        // Send a "table_gone" to everyone, even the people in the game
        // (the players in the game will get a new "table" message shortly)

        for (let userID in globals.connectedUsers) {
            if (globals.connectedUsers.hasOwnProperty(userID) === false) {
                continue;
            }

            globals.connectedUsers[userID].emit('message', {
                type: 'table_gone',
                resp: {
                    id: data.gameID,
                },
            });
        }
    }

    // Set all of the users in the game to "Playing"
    for (let player of game.players) {
        player.socket.playing = true;
        notify.allUserChange(player.socket);
    }

    // Start the timer
    game.turn_begin_time = (new Date()).getTime();
    if (game.timed) {
        data.userID = game.players[data.startingPlayerIndex].userID;
        data.turn_num = 0;
        setTimeout(function() {
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
        let j = Math.floor(Math.random() * i);
        [a[i - 1], a[j]] = [a[j], a[i - 1]];
    }
}
