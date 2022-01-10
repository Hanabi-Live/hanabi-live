// Sent when the user has joined a game and the UI has been initialized
// "data" is empty

// Imports
const globals = require('../globals');
const logger = require('../logger');
const models = require('../models');
const notify = require('../notify');

// When the client has joined a game after they have initialized the UI
exports.step1 = (socket, data) => {
    // Local variables
    data.gameID = socket.currentGame;

    // Check to make sure this table exists
    if (
        !(data.gameID in globals.currentGames) &&
        socket.status !== 'Replay'
    ) {
        logger.warn(`User "${data.username}" tried to ready for game #${data.gameID} with status ${socket.status}, but that game does not exist.`);
        data.reason = 'That game does not exist.';
        notify.playerError(socket, data);
        return;
    }

    if (socket.status === 'Replay' || socket.status === 'Shared Replay') {
        // Fill out the "data.games" object with all of the actions taken
        models.gameActions.getAll(socket, data, step2);
    } else {
        data.game = globals.currentGames[data.gameID];
        step2(null, socket, data);
    }
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error(`models.gameActions.getAll failed: ${error}`);
        return;
    }

    if (socket.status === 'Replay' || socket.status === 'Shared Replay') {
        // Fill out the "data.games" object with the players and their notes
        models.games.getNotes(socket, data, step3);
    } else {
        // data.game was already copied in the previous step
        step3(null, socket, data);
    }
}

function step3(error, socket, data) {
    if (error !== null) {
        logger.error(`models.games.getNotes failed: ${error}`);
        return;
    }

    // This is either from "globals.currentGames" or built by the database
    const { game } = data;

    // Get the index of this player
    let index = -1; // Set an impossible index by default
    if (socket.status !== 'Replay' && socket.status !== 'Shared Replay') {
        // We only have to worry about getting the index if we need to
        // scrub cards
        for (let i = 0; i < game.players.length; i++) {
            if (game.players[i].userID === socket.userID) {
                index = i;
                break;
            }
        }
    }

    // Send a "notify" or "message" message for every game action of the deal
    for (const action of game.actions) {
        // Scrub card info from cards if the card is in their own hand
        let scrubbed = false;
        let scrubbedAction;
        if (action.type === 'draw' && action.who === index) {
            scrubbed = true;
            scrubbedAction = JSON.parse(JSON.stringify(action));
            scrubbedAction.rank = undefined;
            scrubbedAction.suit = undefined;
        }

        socket.emit('message', {
            type: ('text' in action ? 'message' : 'notify'),
            resp: (scrubbed ? scrubbedAction : action),
        });
    }

    // If it is their turn, send an "action" message
    if (
        socket.status !== 'Replay' &&
        socket.status !== 'Shared Replay' &&
        game.turnPlayerIndex === index
    ) {
        notify.playerAction(socket, data);
    }

    // Send an "advanced" message
    // (if this is not sent during a replay, the UI will look uninitialized)
    socket.emit('message', {
        type: 'advanced',
    });

    // Check if the game is still in progress
    if (socket.status === 'Replay' || socket.status === 'Shared Replay') {
        // Since the game is over, send them the notes from everyone in the game
        sendAllNotes(socket, data);
    } else {
        // Send them the current time for all player's clocks
        const times = [];
        for (let i = 0; i < game.players.length; i++) {
            let { time } = game.players[i];

            // Since we are sending the message in the middle of someone's turn,
            // we need to account for this
            if (game.turnPlayerIndex === i) {
                const currentTime = (new Date()).getTime();
                const elapsedTime = currentTime - game.turnBeginTime;
                time -= elapsedTime;
            }

            times.push(time);
        }
        socket.emit('message', {
            type: 'clock',
            resp: {
                times,
                active: game.turnPlayerIndex,
            },
        });

        if (index === -1) {
            // They are a spectator, so send them the notes from all players
            sendAllNotes(socket, data);
        } else {
            // Send them a list of only their notes
            socket.emit('message', {
                type: 'notes',
                resp: {
                    notes: game.players[index].notes,
                },
            });
        }
    }

    // Send them the number of spectators
    if (socket.status !== 'Replay') {
        notify.playerSpectators(socket, data);
    }

    if (socket.status === 'Shared Replay') {
        // Enable the replay controls for the leader of the review
        notify.playerReplayLeader(socket, data);

        // Send them to the current turn that everyone else is at
        socket.emit('message', {
            type: 'replayTurn',
            resp: {
                // We can't use "game.turnNum", because that is a "fake" object
                // given by the model
                turn: globals.currentGames[data.gameID].turnNum,
            },
        });
    }
}

function sendAllNotes(socket, data) {
    // This is either from "globals.currentGames" or built by the database
    const { game } = data;

    // Compile all of the notes together
    const notes = [];
    for (let i = 0; i < game.players.length; i++) {
        const player = game.players[i];
        for (let j = 0; j < player.notes.length; j++) {
            const note = player.notes[j];
            if (typeof note !== 'undefined' && note !== null) {
                if (typeof notes[j] === 'undefined') {
                    notes[j] = '';
                }
                notes[j] += `${player.username}: ${note}\n`;
            }
        }
    }

    // Chop off all of the trailing newlines
    for (let i = 0; i < notes.length; i++) {
        if (typeof notes[i] !== 'undefined' && notes[i] !== null && notes[i].length > 0) {
            notes[i] = notes[i].slice(0, -1);
        }
    }

    // Send it
    socket.emit('message', {
        type: 'notes',
        resp: {
            notes,
        },
    });
}
