'use strict';

// A collection of functions used to notify groups of people about something
// (either everyone connected to the server or everyone in a game)
// Note that notify in this sense does not mean the "notify" message;
// it can be alterting groups of users about anything

// Imports
const globals = require('./globals');

/*
    Functions that notify all users
*/

exports.allUserChange = function(socket) {
    // Send everyone an update about this user
    for (let userID in globals.connectedUsers) {
        if (globals.connectedUsers.hasOwnProperty(userID) === false) {
            continue;
        }

        globals.connectedUsers[userID].emit('message', {
            type: 'user',
            resp: {
                id:      socket.userID,
                name:    socket.username,
                playing: socket.playing,
                seated:  socket.seated,
            },
        });
    }
};

exports.allTableChange = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Send everyone an update about this table
    for (let userID in globals.connectedUsers) {
        if (globals.connectedUsers.hasOwnProperty(userID) === false) {
            continue;
        }

        // Find out if this player is seated at this table
        let joined = false;
        for (let i = 0; i < game.players.length; i++) {
            if (game.players[i].userID === parseInt(userID, 10)) {
                joined = true;
                data.index = i;
                break;
            }
        }

        globals.connectedUsers[userID].emit('message', {
            type: 'table',
            resp: {
                id:          data.gameID,
                name:        game.name,
                joined:      joined,
                num_players: game.players.length,
                max_players: game.max_players,
                allow_spec:  game.allow_spec,
                timed:       game.timed,
                owned:       parseInt(userID, 10) === game.owner,
                running:     game.running,
                variant:     game.variant,
                our_turn:    (joined && game.turn === data.index),
            },
        });
    }
};

exports.allTableGone = function(data) {
    // Send everyone an update about this table
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
};

/*
    Functions that notify members of the game (and the spectators of that game)
*/

exports.gameMemberChange = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Send the people in the game an update about the new player
    for (let player of game.players) {
        player.socket.emit('message', {
            type: 'game',
            resp: {
                name:        game.name,
                running:     game.running,
                num_players: game.players.length,
                max_players: game.max_players,
                variant:     game.variant,
                allow_spec:  game.allow_spec,
                timed:       game.timed,
            },
        });

        // Tell the client to redraw all of the lobby rectanges to account for the new player
        // (it might be wasteful, but this is how the real server appears to work)
        for (let i = 0; i < game.players.length; i++) {
            let player2 = game.players[i];

            player.socket.emit('message', {
                type: 'game_player',
                resp: {
                    index:      i,
                    name:       player2.socket.username,
                    you:        (player.userID === player2.userID),
                    present:    game.players[i].present,
                    started:    player2.socket.num_started,
                    finished:   player2.socket.num_finished,
                    best_score: player2.socket.best_score,
                },
            });
        }
    }

    // Lastly, send the table owner whether or not the "Start Game" button should be greyed out
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

exports.gameAction = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];
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
    for (let userID in game.spectators) {
        if (game.spectators.hasOwnProperty(userID) === false) {
            continue;
        }

        game.spectators[userID].emit('message', {
            type: ('text' in action ? 'message' : 'notify'),
            resp: action,
        });
    }
};

exports.gameTime = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Create the clock message
    let times = [];
    for (let player of game.players) {
        times.push(player.time);
    }
    let clockMsg = {
        type: 'clock',
        resp: {
            times: times,
            active: game.turn_player_index,
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
};

exports.gameSound = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Send a sound notification
    for (let i = 0; i < game.players.length; i++) {
        let player = game.players[i];
        player.socket.emit('message', {
            type: 'sound',
            resp: {
                file: (i === game.turn_player_index ? 'turn_us' : 'turn_other'),
            },
        });
    }
    for (let userID in game.spectators) {
        if (game.spectators.hasOwnProperty(userID) === false) {
            continue;
        }

        game.spectators[userID].emit('message', {
            type: 'sound',
            resp: {
                file: 'turn_other',
            },
        });
    }
};

exports.gameBoot = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

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
    for (let userID in game.spectators) {
        if (game.spectators.hasOwnProperty(userID) === false) {
            continue;
        }

        game.spectators[userID].emit('message', msg);
    }
};

/*
    Functions that notify a specific user/player
*/

exports.playerAction = function(socket, data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    socket.emit('message', {
        type: 'action',
        resp: {
            can_clue:            (game.clue_num > 0 ? true : false),
            can_discard:         (game.clue_num < 8 ? true : false),
            can_blind_play_deck: (game.deckIndex === game.deck.length - 1 ? true : false),
        },
    });
};
