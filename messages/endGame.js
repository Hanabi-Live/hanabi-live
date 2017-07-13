'use strict';

// The "end_game" message is not actually sent by the client;
// we just store the logic here for organizational purposes since
// the start game logic is stored under the "start_game" command

// Imports
const globals = require('../globals');
const logger  = require('../logger');
const models  = require('../models');
const notify  = require('../notify');

exports.step1 = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Send text messages showing how much time each player finished with
    if (game.timed) {
        for (let player of game.players) {
            let text = player.username + ' finished with a time of ';
            let seconds = Math.ceil(player.time / 1000);
            text += seconds_to_time_display(seconds);
            game.actions.push({
                text: text,
            });
            notify.gameAction(data);
            logger.info('[Game ' + data.gameID + '] ' + text);
        }
    }

    // Send the "game_over" message
    game.actions.push({
        type:  'game_over',
        score: game.score,
        loss:  data.loss,
    });
    notify.gameAction(data);

    // Send "reveal" messages to each player about the missing cards in their hand
    for (let player of game.players) {
        for (let card of player.hand) {
            player.socket.emit('message', {
                type: 'notify',
                resp: {
                    type: 'reveal',
                    which: {
                        index: card.index,
                        rank:  card.rank,
                        suit:  card.suit,
                        order: card.order,
                    },
                },
            });
        }
    }

    if (data.loss) {
        game.score = 0;
    }

    // End the game in the database
    data.score = game.score;
    models.games.end(data, gameEnd2);
};

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
                id:          data.gameID,
                num_players: game.players.length,
                num_similar: data.num_similar,
                score:       game.score,
                variant:     game.variant,
            },
        });
    }

    // Keep track of the game ending
    logger.info('[Game ' + data.gameID + '] Ended with a score of ' + game.score + '.');
    delete globals.currentGames[data.gameID];

    // Notify everyone that the table was deleted
    notify.allTableGone(data);

    // Reset the status of the players
    for (let player of game.players) {
        player.socket.status = 'Replay';
        notify.allUserChange(player.socket);
    }
}

function seconds_to_time_display(seconds) {
    return Math.floor(seconds / 60) + ":" + pad2(seconds % 60);
}

function pad2(num) {
    if (num < 10) {
        return "0" + num;
    }
    return "" + num;
}
