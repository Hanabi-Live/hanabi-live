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
    models.games.end(data, step2);
};

function step2(error, data) {
    if (error !== null) {
        logger.error(`models.games.end failed: ${error}`);
        return;
    }

    // Add all of the participants
    data.insertNum = -1;
    step3(null, data);
}

function step3(error, data) {
    if (error !== null) {
        logger.error(`models.gameParticipants.create failed: ${error}`);
        return;
    }

    // Local variables
    const game = globals.currentGames[data.gameID];

    data.insertNum += 1;
    if (data.insertNum < game.players.length) {
        data.userID = game.players[data.insertNum].userID;
        models.gameParticipants.create(data, step3);
        return;
    }

    // Insert all of the actions taken
    data.insertNum = -1;
    step4(null, data);
}

function step4(error, data) {
    if (error !== null) {
        logger.error(`models.gameActions.create failed: ${error}`);
        return;
    }

    // Local variables
    const game = globals.currentGames[data.gameID];

    data.insertNum += 1;
    if (data.insertNum < game.actions.length) {
        data.action = JSON.stringify(game.actions[data.insertNum]);
        models.gameActions.create(data, step4);
        return;
    }

    // Get the numSimilar for this game
    models.games.getNumSimilar(data, step5);
}

function step5(error, data) {
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

    // Begin to update all of the player's stats
    data.insertNum = -1;
    step6(null, data);
}

function step6(error, data) {
    if (error !== null) {
        logger.error(`models.users.updateStats failed: ${error}`);
        return;
    }

    // Local variables
    const game = globals.currentGames[data.gameID];

    data.insertNum += 1;
    if (data.insertNum < game.players.length) {
        data.userID = game.players[data.insertNum].userID;
        models.users.updateStats(data, step6);
        return;
    }

    // Now that we have updated them, get the new stats for each player
    data.insertNum = -1;
    step7(null, data);
}

function step7(error, data) {
    if (error !== null) {
        logger.error(`models.users.getStats failed: ${error}`);
        return;
    }

    // Local variables
    const game = globals.currentGames[data.gameID];

    if (data.insertNum !== -1) {
        game.players[data.insertNum].socket.numPlayed = data.numPlayed;
        game.players[data.insertNum].socket.averageScore = data.averageScore;
        game.players[data.insertNum].socket.strikeoutRate = data.strikeoutRate;
    }

    data.insertNum += 1;
    if (data.insertNum < game.players.length) {
        data.userID = game.players[data.insertNum].userID;
        models.users.getStats(data, step7);
        return;
    }

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
