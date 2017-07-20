'use strict';

// A collection of functions used to notify groups of people about something
// (either everyone connected to the server or everyone in a game)
// Note that notify in this sense does not mean the "notify" message;
// it can be alterting groups of users about anything

// Imports
const globals = require('./globals');
const logger  = require('./logger');

/*
    Functions that notify all users
*/

exports.allUserChange = function(socket) {
    // Send everyone an update about this user
    for (let userID of Object.keys(globals.connectedUsers)) {
        globals.connectedUsers[userID].emit('message', {
            type: 'user',
            resp: {
                id:     socket.userID,
                name:   socket.username,
                status: socket.status,
            },
        });
    }
};

exports.allTableChange = function(data) {
    // Validate that the game exists
    if (!(data.gameID in globals.currentGames)) {
        logger.error(`Error: notify.allTableChange was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    // Send everyone an update about this table
    for (let userID of Object.keys(globals.connectedUsers)) {
        playerTable(globals.connectedUsers[userID], data);
    }
};

exports.allTableGone = function(data) {
    // Send everyone an update about this table
    for (let userID of Object.keys(globals.connectedUsers)) {
        globals.connectedUsers[userID].emit('message', {
            type: 'table_gone',
            resp: {
                id: data.gameID,
            },
        });
    }
};

/*
    Functions that notify members of the game (and the spectators of that game)
*/

exports.gameMemberChange = function(data) {
    // Validate that the game exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.error(`Error: notify.gameMemberChange was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    // Send the people in the game an update about the new player
    for (let player of game.players) {
        player.socket.emit('message', {
            type: 'game',
            resp: {
                name:          game.name,
                running:       game.running,
                num_players:   game.players.length,
                max_players:   game.max_players,
                variant:       game.variant,
                allow_spec:    game.allow_spec,
                num_spec:      game.num_spec,
                timed:         game.timed,
                shared_replay: game.shared_replay,
            },
        });

        // Tell the client to redraw all of the lobby rectanges to account for
        // the new player (it might be wasteful, but this is how the real
        // server appears to work)
        for (let i = 0; i < game.players.length; i++) {
            let player2 = game.players[i];

            player.socket.emit('message', {
                type: 'game_player',
                resp: {
                    index:          i,
                    name:           player2.socket.username,
                    you:            (player.userID === player2.userID),
                    present:        game.players[i].present,
                    num_played:     player2.socket.num_played,
                    average_score:  player2.socket.average_score,
                    strikeout_rate: player2.socket.strikeout_rate,
                },
            });
        }
    }

    // Lastly, send the table owner whether or not the "Start Game" button
    // should be greyed out
    for (let player of game.players) {
        if (player.userID === game.owner) {
            player.socket.emit('message', {
                type: 'table_ready',
                resp: {
                    ready: (game.players.length >= 2),
                },
            });
            break;
        }
    }
};

exports.gameConnected = function(data) {
    // Validate that the game exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.error(`Error: notify.gamesConnected was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    // Make a list of who is currently connected of the players in the
    // current game
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

exports.gameAction = function(data) {
    // Validate that the game exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.error(`Error: notify.gameAction was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    // Local variables
    let lastIndex = game.actions.length - 1;
    let action = game.actions[lastIndex];

    // Send the people in the game an update about the new action
    for (let i = 0; i < game.players.length; i++) {
        // Scrub card info from cards if the card is in their own hand
        let scrubbed = false;
        let scrubbedAction;
        if (action.type === 'draw' && action.who === i) {
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
    for (let userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', {
            type: ('text' in action ? 'message' : 'notify'),
            resp: action,
        });
    }
};

exports.gameNumSpec = function(data) {
    // Validate that the game exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.error(`Error: notify.gameNumSpec was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    // Create the "num_spec" message
    let times = [];
    for (let player of game.players) {
        times.push(player.time);
    }
    let specMsg = {
        type: 'num_spec',
        resp: {
            num: game.num_spec,
        },
    };

    // Send the message to all the players in the game
    for (let player of game.players) {
        player.socket.emit('message', specMsg);
    }

    // Also send it to the spectators
    for (let userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', specMsg);
    }
};

exports.gameTime = function(data) {
    // Validate that the game exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.error(`Error: notify.gameTime was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    // Create the clock message
    let times = [];
    for (let player of game.players) {
        times.push(player.time);
    }
    let clockMsg = {
        type: 'clock',
        resp: {
            times: times,
            active: data.end ? null : game.turn_player_index,
        },
    };

    // Send the clock message for this player to all the players in the game
    for (let player of game.players) {
        player.socket.emit('message', clockMsg);
    }

    // Also send it to the spectators
    for (let userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', clockMsg);
    }
};

exports.gameSound = function(data) {
    // Validate that the game exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.error(`Error: notify.gameSound was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    // Send a sound notification
    for (let i = 0; i < game.players.length; i++) {
        let player = game.players[i];

        // Prepare the sound message
        let sound = 'turn_other';
        if (game.sound !== null) {
            sound = game.sound;
        } else if (i === game.turn_player_index) {
            sound = 'turn_us';
        }
        let msg = {
            type: 'sound',
            resp: {
                file: sound,
            },
        };

        player.socket.emit('message', msg);
    }
    for (let userID of Object.keys(game.spectators)) {
        // Prepare the sound message
        // (the code is duplicated here because I don't want to mess with
        // having to change the file name back to default)
        let sound = 'turn_other';
        if (game.sound !== null) {
            sound = game.sound;
        }
        let msg = {
            type: 'sound',
            resp: {
                file: sound,
            },
        };
        game.spectators[userID].emit('message', msg);
    }
};

exports.gameBoot = function(data) {
    // Validate that the game exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.error(`Error: notify.gameBoot was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    // Send a boot notification
    let msg = {
        type: 'notify',
        resp: {
            type: 'boot',
            who: data.who,
        },
    };

    for (let i = 0; i < game.players.length; i++) {
        let player = game.players[i];
        player.socket.emit('message', msg);
    }
    for (let userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', msg);
    }
};

/*
    Functions that notify all spectators of the game
*/

exports.spectatorsNote = function(data) {
    // Validate that the game exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.error(`Error: notify.spectatorsNote was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    let msg = {
        type: 'note',
        resp: {
            order: data.order,
            // The order of the card in the deck that these notes correspond to
            notes: game.deck[data.order].notes,
            // "notes" is an array of strings, one for each player
        },
    };

    for (let userID of Object.keys(game.spectators)) {
        game.spectators[userID].emit('message', msg);
    }
};

/*
    Functions that notify a specific user/player
*/

const playerTable = function(socket, data) {
    // Validate that the game exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.error(`Error: notify.playerTable was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    // Find out if this player is seated at this table
    let joined = false;
    for (let i = 0; i < game.players.length; i++) {
        if (game.players[i].userID === socket.userID) {
            joined = true;
            data.index = i;
            break;
        }
    }

    socket.emit('message', {
        type: 'table',
        resp: {
            id:            data.gameID,
            name:          game.name,
            joined:        joined,
            num_players:   game.players.length,
            max_players:   game.max_players,
            allow_spec:    game.allow_spec,
            timed:         game.timed,
            owned:         socket.userID === game.owner,
            running:       game.running,
            variant:       game.variant,
            our_turn:      (joined && game.running && game.turn_player_index === data.index),
            shared_replay: game.shared_replay,
        },
    });
};
exports.playerTable = playerTable;

exports.playerGameStart = function(socket) {
    socket.emit('message', {
        type: 'game_start',
        resp: {
            replay:        (socket.status === 'Replay' || socket.status === 'Shared Replay'),
            shared_replay: (socket.status === 'Shared Replay'),
        },
    });
};

exports.playerAction = function(socket, data) {
    // Validate that the game exists
    let game;
    if (data.gameID in globals.currentGames) {
        game = globals.currentGames[data.gameID];
    } else {
        logger.error(`Error: notify.playerAction was called for game #${data.gameID}, but it does not exist.`);
        return;
    }

    socket.emit('message', {
        type: 'action',
        resp: {
            can_clue:            (game.clue_num > 0),
            can_discard:         (game.clue_num < 8),
            can_blind_play_deck: (game.deckIndex === game.deck.length - 1),
        },
    });
};

exports.playerDenied = function(socket, data) {
    socket.emit('message', {
        type: 'denied',
        resp: {
            reason: data.reason,
        },
    });
};
