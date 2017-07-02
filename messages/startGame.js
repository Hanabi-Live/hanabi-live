'use strict';

// Sent when the owner of a table clicks on the "Start Game" button
// (the client will send a "hello" message after getting "game_start")
// "data" is empty

// Imports
const seedrandom = require('seedrandom');
const globals    = require('../globals');
const models     = require('../models');
const messages   = require('../messages');

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
                });
            }
        }
    }

    // Create the stacks
    for (let i = 0; i < suits.length; i++) {
        game.stacks.push(0);
    }

    // Create a seed
    // TODO find a seed that noone has played before
    data.seed = 1;
    game.seed = data.seed;

    // Shuffle the deck and players
    seedrandom(data.seed, {
        global: true, // So that it applies to "Math.random()"
    });
    shuffle(game.deck);

    // Deal the cards
    let handSize = 5;
    if (game.players.length > 2) {
        handSize = 4;
    }
    for (let i = 0; i < game.players.length; i++) {
        for (let j = 0; j < handSize; j++) {
            data.index = i;
            messages.action.playerDrawCard(data);
        }
    }

    // Get a random player to start first
    let startingPlayerIndex = Math.floor(Math.random() * game.players.length);
    game.turn_player_index = startingPlayerIndex; // Keep track of whose turn it is
    let text = game.players[startingPlayerIndex].username + ' goes first';
    game.actions.push({
        text: text,
    });
    game.actions.push({
        num: 0,
        type: 'turn',
        who: startingPlayerIndex,
    });

    // Set the game to running
    game.running = true;

    // Start the game in the database (which sets the "status", "seed", and "datetime_started" columns)
    models.games.start(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        console.error('Error: models.games.start failed:', error);
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
        messages.join_table.notifyAllTableChange(data);
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

    // Set all of the users in the game to "playing"
    for (let player of game.players) {
        player.socket.playing = true;
        messages.join_table.notifyAllUserChange(player.socket);
    }

    notifyGameConnected(data);
}

const notifyGameConnected = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Make a list of who is currently connected of the players in the current game
    let list = [];
    for (let player of game.players) {
        list.push(player.present);
    }

    // Send a "connected" message to all of the users in the game
    for (let i = 0; i < game.players.length; i++) {
        game.players[i].socket.emit('message', {
            type: 'connected',
            resp: {
                list: list,
                num_spec: game.num_spec,
            },
        });
    }
};
exports.notifyGameConnected = notifyGameConnected;

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
