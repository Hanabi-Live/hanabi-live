'use strict';

// Sent when the user performs an in-game action
// "data" example:
/*
    {
        clue: { // Not present if the type is 1 or 2
            type: 0, // 0 is a number clue, 1 is a color clue
            value: 1,
        },
        target: 1, // Either the player index of the recipient of the clue, or the card ID (e.g. the first card of the deck drawn is card #1, etc.)
        type: 0, // 0 is a clue, 1 is a play, 2 is a discard, 3 is end game (only used by the server)
    }
*/

// Imports
const globals  = require('../globals');
const logger   = require('../logger');
const models   = require('../models');
const messages = require('../messages');

const step1 = function(socket, data) {
    // Local variables
    data.gameID = socket.atTable.id;
    let end = false;
    let loss = false;

    // Validate that this table exists
    if (data.gameID in globals.currentGames === false) {
        return;
    }
    let game = globals.currentGames[data.gameID];

    // Get the index of this player
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === socket.userID) {
            data.index = i;
            break;
        }
    }
    let player = game.players[data.index];

    // Validate that it is this player's turn
    if (game.turn_player_index !== data.index) {
        return;
    }

    // There are 3 types of actions
    if (data.type === 0) {
        playerClue(data);

    } else if (data.type === 1 || data.type === 2) {
        // We are not allowed to discard while at 8 clues
        // (the client should enforce this, but do a check just in case)
        if (data.type === 2 && game.clue_num == 8) {
            return;
        }

        // Remove the card from their hand
        for (let i = 0; i < player.hand.length; i++) {
            if (player.hand[i].order === data.target) {
                player.hand.splice(i, 1);
                break;
            }
        }

        if (data.type === 1) {
            playerPlayCard(data);
        } else if (data.type === 2) {
            game.clue_num++; // We should never be discarding at 8 clues
            playerDiscardCard(data);
        }
        playerDrawCard(data);

    } else if (data.type === 3) {
        // This is a special action type sent by the server to itself when a player runs out of time
        game.strikes = 3;

        let text = game.players[game.turn_player_index].username + ' ran out of time!';
        game.actions.push({
            text: text,
        });
        notifyGameAction(data);
        logger.info('[Game ' + data.gameID + '] ' + text);

    } else {
        logger.error('Error: Unknown action type: ' + data.type);
        return;
    }

    // Send messages about the current status
    game.actions.push({
        clues: game.clue_num,
        score: game.score,
        type: 'status',
    });
    notifyGameAction(data);

    // Adjust the timer for the player that just took their turn
    if (game.timed) {
        let now = (new Date()).getTime();
        player.time -= now - game.turn_begin_time;
        player.time += globals.extraTurnTime; // A player gets an additional X seconds for making a move
        game.turn_begin_time = now;
    }

    // Increment the turn
    game.turn_num++;
    game.turn_player_index++;
    if (game.turn_player_index === game.players.length) {
        game.turn_player_index = 0;
    }

    // Check for end game states
    if (game.strikes === 3) {
        end = true;
        loss = true;

        let text = 'Players lose';
        game.actions.push({
            text: text,
        });
        notifyGameAction(data);
        logger.info('[Game ' + data.gameID + '] ' + text);

    } else if (game.turn_num == game.end_turn_num ||
               (game.variant == 0 && game.score == 20) ||
               (game.variant == 1 && game.score == 30) ||
               (game.variant == 2 && game.score == 25) ||
               (game.variant == 3 && game.score == 30)) {

        end = true;

        let text = 'Players score ' + game.score + ' points';
        game.actions.push({
            text: text,
        });
        notifyGameAction(data);
        logger.info('[Game ' + data.gameID + '] ' + text);
    }

    if (end) {
        gameEnd(data, loss);
        return;
    }

    // Send messages about the current turn
    game.actions.push({
        num: game.turn_num,
        type: 'turn',
        who: game.turn_player_index,
    });
    notifyGameAction(data);
    logger.info('[Game ' + data.gameID + '] It is now ' + game.players[game.turn_player_index].username + '\'s turn.');

    // Send the "action" message to the next player
    let i = game.turn_player_index;
    game.players[i].socket.emit('message', {
        type: 'action',
        resp: {
            can_clue: (game.clue_num > 0 ? true : false),
            can_discard: (game.clue_num < 8 ? true : false),
        },
    });

    messages.join_table.notifyAllTableChange(data);
    // (this seems wasteful but this is apparently used so that you can see if it is your turn from the lobby)

    //messages.join_table.notifyGameMemberChange(data);
    // (Keldon does this but it seems unnecessary)

    if (game.timed) {
        // Send everyone new clock values
        notifyGameTime(data);

        // Start the function that will check to see if the current player has run out of time
        // (it just got to be their turn)
        data.userID = game.players[game.turn_player_index].userID;
        data.turn_num = game.turn_num;
        setTimeout(function() {
            checkTimer(data);
        }, game.players[game.turn_player_index].time);
    }
};
exports.step1 = step1;

// Type 0 - A clue
function playerClue(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Validate that there are clues available to use
    if (game.clue_num === 0) {
        return;
    }

    // Decrement the clues
    game.clue_num--;

    // Find out what cards this clue touches
    let list = [];
    for (let card of game.players[data.target].hand) {
        if (data.clue.type === 0) { // Number clue
            if (card.rank === data.clue.value) {
                list.push(card.order);
            }
        } else if (data.clue.type === 1) { // Color clue
            // Account for rainbow cards
            if (card.suit === data.clue.value || (card.suit === 5 && game.variant === 3)) {
                list.push(card.order);
            }
        }
    }
    if (list.length === 0) {
        logger.warn('This clue touches no cards! Something went wrong...');
        return;
    }

    // Send the "notify" message about the clue
    game.actions.push({
        clue: data.clue,
        giver: data.index,
        list: list,
        target: data.target,
        type: 'clue',
    });
    notifyGameAction(data);

    // Send the "message" message about the clue
    let text = game.players[data.index].username + ' tells ';
    text += game.players[data.target].username + ' about ';
    let words = ['', 'one', 'two', 'three', 'four', 'five'];
    text += words[list.length] + ' ';
    if (data.clue.type === 0) { // Number clue
        text += data.clue.value;
    } else if (data.clue.type === 1) { // Color clue
        text += globals.suits[data.clue.value];
    }
    if (list.length > 1) {
        text += 's';
    }
    game.actions.push({
        text: text,
    });
    notifyGameAction(data);
    logger.info('[Game ' + data.gameID + '] ' + text);
}

function playerPlayCard(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];
    let player = game.players[data.index];
    let card = game.deck[data.target];
    let suit = (card.suit === 5 && game.variant === 3 ? globals.suits[card.suit + 1] : globals.suits[card.suit]);

    // Find out if this successfully plays
    if (card.rank === game.stacks[card.suit] + 1) {
        // Success
        game.score++;
        game.stacks[card.suit]++;

        // Send the "notify" message about the play
        game.actions.push({
            type: 'played',
            which: {
                index: data.index,
                order: card.order,
                rank: card.rank,
                suit: card.suit,
            },
        });
        notifyGameAction(data);

        // Send the "message" about the play
        let text = game.players[data.index].username + ' plays ';
        text += suit + ' ' + card.rank;
        game.actions.push({
            text: text,
        });
        notifyGameAction(data);
        logger.info('[Game ' + data.gameID + '] ' + text);

        // Give the team a clue if a 5 was played
        if (card.rank === 5) {
            game.clue_num++;
            if (game.clue_num > 8) {
                game.clue_num = 8; // The extra clue is wasted if they are at 8 clues already
            }
        }

    } else {
        // Send the "notify" message about the strike
        game.strikes++;
        game.actions.push({
            num: game.strikes,
            type: 'strike',
        });
        notifyGameAction(data);

        playerDiscardCard(data, true);
    }
}

function playerDiscardCard(data, failed = false) {
    // Local variables
    let game = globals.currentGames[data.gameID];
    let card = game.deck[data.target];
    let suit = (card.suit === 5 && game.variant === 3 ? globals.suits[card.suit + 1] : globals.suits[card.suit]);

    game.actions.push({
        type: 'discard',
        which: {
            index: data.index,
            order: data.target,
            rank: card.rank,
            suit: card.suit,
        },
    });
    notifyGameAction(data);

    let text = game.players[data.index].username + ' ';
    if (failed) {
        text += 'fails to play';
    } else {
        text += 'discards';
    }
    text += ' ' + suit + ' ' + card.rank;
    game.actions.push({
        text: text,
    });
    notifyGameAction(data);
    logger.info('[Game ' + data.gameID + '] ' + text);
}

// We have to use "data.index" instead of "globals.currentGames[data.gameID].turn_player_index"
// because this is used before the game starts
const playerDrawCard = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Check to see if the deck is empty
    if (game.deckIndex >= game.deck.length) {
        // Don't draw any more cards if the deck is empty
        return;
    }

    let card = game.deck[game.deckIndex];
    card.order = game.deckIndex;
    game.players[data.index].hand.push(card);
    game.actions.push({
        order: game.deckIndex,
        rank: card.rank,
        suit: card.suit,
        type: 'draw',
        who: data.index,
    });
    game.deckIndex++;

    if (game.running) {
        notifyGameAction(data);
    }

    game.actions.push({
        size: game.deck.length - game.deckIndex,
        type: 'draw_size',
    });

    if (game.running) {
        notifyGameAction(data);
    }

    // Check to see if that was the last card drawn
    if (game.deckIndex >= game.deck.length) {
        // Mark the turn upon which the game will end
        game.end_turn_num = game.turn_num + game.players.length + 1;
    }
};
exports.playerDrawCard = playerDrawCard;

function gameEnd(data, loss) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Send the "game_over" message
    game.actions.push({
        loss: loss,
        score: game.score,
        type: 'game_over',
    });
    notifyGameAction(data);

    // Send "reveal" messages to each player about the missing cards in their hand
    for (let player of game.players) {
        for (let card of player.hand) {
            player.socket.emit('message', {
                type: 'notify',
                resp: {
                    type: 'reveal',
                    which: {
                        index: card.index,
                        order: card.order,
                        rank: card.rank,
                        suit: card.suit,
                    },
                },
            });
        }
    }

    if (loss) {
        game.score = 0;
    }

    // End the game in the database
    data.score = game.score;
    models.games.end(data, gameEnd2);
}

function gameEnd2(error, data) {
    if (error !== null) {
        logger.error('Error: models.games.end failed:', error);
        return;
    }

    // Insert all of the actions taken
    data.insertNum = -1;
    gameEnd3(null, data);
}

function gameEnd3(error, data) {
    if (error !== null) {
        logger.error('Error: models.gameActions.create failed:', error);
        return;
    }

    // Local variables
    let game = globals.currentGames[data.gameID];

    data.insertNum++;
    if (data.insertNum < game.actions.length) {
        data.action = JSON.stringify(game.actions[data.insertNum]);
        models.gameActions.create(data, gameEnd3);
        return;
    }

    // Get the num_similar for this game
    models.games.getNumSimilar(data, gameEnd4);
}

function gameEnd4(error, data) {
    if (error !== null) {
        logger.error('Error: models.games.getNumSimilar failed:', error);
        return;
    }

    // Local variables
    let game = globals.currentGames[data.gameID];

    // Send a "game_history" message to all the players in the game
    for (let player of game.players) {
        player.socket.emit('message', {
            type: 'game_history',
            resp: {
                id: data.gameID,
                num_players: game.players.length,
                num_similar: data.num_similar,
                score: game.score,
                variant: game.variant,
            },
        });
    }

    // Keep track of the game ending
    logger.info('[Game ' + data.gameID + '] Ended with a score of ' + game.score + '.');
    delete globals.currentGames[data.gameID];

    // Notify everyone that the table was deleted
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

function notifyGameAction(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];
    let lastIndex = game.actions.length - 1;
    let action = game.actions[lastIndex];

    // Send the people in the game an update about the new action
    for (let i = 0; i < game.players.length; i++) {
        // Scrub card info from cards if the card is in their own hand
        let scrubbed = false;
        let scrubbedAction;
        if (action.type === 'draw' && action.who == i) {
            scrubbed = true;
            scrubbedAction = JSON.parse(JSON.stringify(action));
            scrubbedAction.rank = undefined;
            scrubbedAction.suit = undefined;
        }

        game.players[i].socket.emit('message', {
            type: ('text' in action ? 'message' : 'notify'),
            resp: (scrubbed ? scrubbedAction : action),
        });
    }

    // Also send the spectators an update
    for (let userID in game.spectators) {
        if (game.spectators.hasOwnProperty(userID) === false) {
            continue;
        }

        game.spectators[userID].emit('message', {
            type: ('text' in action ? 'message' : 'notify'),
            resp: action,
        });
    }
}

const notifyGameTime = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Go through all the players in the game
    for (let i = 0; i < game.players.length; i++) {
        // Prepare the clock message
        let clockMsg = {
            type: 'clock',
            resp: {
                time: game.players[i].time,
                who: i,
                active: (game.turn_player_index === i ? true : false),
            },
        };

        // Send the clock message for this player to all the players in the game
        for (let player of game.players) {
            player.socket.emit('message', clockMsg);
        }

        // Also send it to the spectators
        for (let userID in game.spectators) {
            if (game.spectators.hasOwnProperty(userID) === false) {
                continue;
            }

            game.spectators[userID].emit('message', clockMsg);
        }
    }
};
exports.notifyGameTime = notifyGameTime;

const checkTimer = function(data) {
    // Check to see if the game ended already
    if (data.gameID in globals.currentGames === false) {
        return;
    }

    // Local variables
    let game = globals.currentGames[data.gameID];

    // Check to see if we have made a move in the meanwhiled
    if (data.turn_num !== game.turn_num) {
        return;
    }

    // Get the index of this player
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === data.userID) {
            data.index = i;
            break;
        }
    }
    let player = game.players[data.index];
    logger.info('Time ran out for "' + player.username + '" playing game #' + data.gameID + '.');

    // End the game
    data.type = 3;
    let fakeSocket = {
        userID: data.userID,
        atTable: {
            id: data.gameID,
        },
    };
    step1(fakeSocket, data);
};
exports.checkTimer = checkTimer;
