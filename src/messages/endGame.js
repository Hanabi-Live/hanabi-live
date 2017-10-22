// The "endGame" message is not actually sent by the client;
// we just store the logic here for organizational purposes since
// the start game logic is stored under the "startGame" command

// Imports
const globals = require('../globals');
const logger = require('../logger');
const models = require('../models');
const notify = require('../notify');

exports.step1 = (data) => {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // If this is a timed game, we want to show the finishing times
    // But do it in 3 seconds so that it does not interfere with the final move of the game
    if (game.timed) {
        setTimeout(() => {
            step2(data);
        }, 3000);
    } else {
        step3(data);
    }
};

function step2(data) {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Advance a turn so that we have an extra separator before the finishing times
    game.actions.push({
        num: game.turnNum,
        type: 'turn',
        who: game.turnPlayerIndex,
    });
    notify.gameAction(data);

    // Send text messages showing how much time each player finished with
    for (const player of game.players) {
        let text = `${player.username} finished with a time of `;
        let seconds = Math.ceil(player.time / 1000);
        if (!game.timed) {
            seconds *= -1;
        }
        text += secondsToTimeDisplay(seconds);
        game.actions.push({
            text,
        });
        notify.gameAction(data);
        logger.info(`[Game ${data.gameID}] ${text}`);
    }

    step3(data);
}

function step3(data) {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Send the "gameOver" message
    game.actions.push({
        type: 'gameOver',
        score: game.score,
        loss: data.loss,
    });
    notify.gameAction(data);

    // Send everyone a clock message with an active value of null, which
    // will get rid of the timers on the client-side
    notify.gameTime(data);

    // Send "reveal" messages to each player about the missing cards in their hand
    for (const player of game.players) {
        for (const card of player.hand) {
            player.socket.emit('message', {
                type: 'notify',
                resp: {
                    type: 'reveal',
                    which: {
                        index: card.index,
                        rank: card.rank,
                        suit: card.suit,
                        order: card.order,
                    },
                },
            });
        }
    }

    if (data.loss) {
        game.score = 0;
    }

    // Record the game in the database
    data = {
        name: game.name,
        owner: game.owner,
        variant: game.variant,
        timed: game.timed,
        seed: game.seed,
        score: game.score,
        datetimeCreated: game.datetimeCreated,
        datetimeStarted: game.datetimeStarted,
        // datetimeFinished will automatically be set by MariaDB
        gameID: data.gameID,
    };
    models.games.end(data, step4);
}

function step4(error, data) {
    if (error !== null) {
        logger.error(`models.games.end failed: ${error}`);
        return;
    }

    // Add all of the participants
    data.insertNum = -1;
    step5(null, data);
}

function step5(error, data) {
    if (error !== null) {
        logger.error(`models.gameParticipants.create failed: ${error}`);
        return;
    }

    // Local variables
    const game = globals.currentGames[data.gameID];

    data.insertNum += 1;
    if (data.insertNum < game.players.length) {
        data.userID = game.players[data.insertNum].userID;
        models.gameParticipants.create(data, step5);
        return;
    }

    // Insert all of the actions taken
    data.insertNum = -1;
    step6(null, data);
}

function step6(error, data) {
    if (error !== null) {
        logger.error(`models.gameActions.create failed: ${error}`);
        return;
    }

    // Local variables
    const game = globals.currentGames[data.gameID];

    data.insertNum += 1;
    if (data.insertNum < game.actions.length) {
        data.action = JSON.stringify(game.actions[data.insertNum]);
        models.gameActions.create(data, step6);
        return;
    }

    // Get the numSimilar for this game
    models.games.getNumSimilar(data, step7);
}

function step7(error, data) {
    if (error !== null) {
        logger.error(`models.games.getNumSimilar failed: ${error}`);
        return;
    }

    // Local variables
    const game = globals.currentGames[data.gameID];

    // Send a "gameHistory" message to all the players in the game
    for (const player of game.players) {
        player.socket.emit('message', {
            type: 'gameHistory',
            resp: {
                id: data.gameID,
                numPlayers: game.players.length,
                numSimilar: data.numSimilar,
                score: game.score,
                variant: game.variant,
            },
        });
    }

    // Do the final steps in closing the game
    step8(data);
}

function step8(data) {
    // Local variables
    const game = globals.currentGames[data.gameID];

    // Keep track of the game ending
    logger.info(`[Game ${data.gameID}] Ended with a score of ${game.score}.`);
    delete globals.currentGames[data.gameID];

    // Notify everyone that the table was deleted
    notify.allTableGone(data);

    // Reset the status of the players
    for (const player of game.players) {
        player.socket.currentGame = -1;
        player.socket.status = 'Replay';
        notify.allUserChange(player.socket);
    }
    for (const userID of Object.keys(game.spectators)) {
        const spectator = game.spectators[userID];
        spectator.currentGame = -1;
        spectator.status = 'Replay';
        notify.allUserChange(spectator);
    }
}

/*
    Miscellaneous functions
*/

function secondsToTimeDisplay(seconds) {
    return `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;
}

function pad2(num) {
    if (num < 10) {
        return `0${num}`;
    }
    return `${num}`;
}
