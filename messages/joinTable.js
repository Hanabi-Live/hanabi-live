'use strict';

// Sent when the user clicks on the "Join" button in the lobby
// "data" example:
/*
    {
        table_id: 15103,
    }
*/

// Imports
const globals = require('../globals');
const logger  = require('../logger');
const models  = require('../models');

exports.step1 = function(socket, data) {
    // Prepare the data to feed to the model
    data.userID = socket.userID;
    data.gameID = data.table_id;

    // Validate that this table exists
    if (data.gameID in globals.currentGames === false) {
        return;
    }

    // Join the table
    models.gameParticipants.create(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.gameParticipants.create failed:', error);
        return;
    }

    // Local variables
    let game = globals.currentGames[data.gameID];

    logger.info('User "' + socket.username + '" joined game: #' + data.gameID + ' (' + game.name + ')');

    // Keep track of the user that joined
    game.players.push({
        hand: [],
        userID: socket.userID,
        username: socket.username,
        present: true,
        socket: socket,
        time: globals.startingTime, // In milliseconds
    });
    socket.seated = true;
    socket.atTable = {
        id:         data.gameID,
        replay:     false,
        spectating: false,
    };

    // Make the client switch screens to show the current table status
    socket.emit('message', {
        type: 'joined',
        resp: {
            table_id: data.gameID,
        },
    });

    notifyAllUserChange(socket);
    notifyAllTableChange(data);
    notifyGameMemberChange(data);
}

const notifyAllUserChange = function(socket) {
    // Send everyone an update about this user
    for (let userID in globals.connectedUsers) {
        if (globals.connectedUsers.hasOwnProperty(userID) === false) {
            continue;
        }

        globals.connectedUsers[userID].emit('message', {
            type: 'user',
            resp: {
                id: socket.userID,
                name: socket.username,
                playing: socket.playing,
                seated: socket.seated,
            },
        });
    }
};
exports.notifyAllUserChange = notifyAllUserChange;

const notifyAllTableChange = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Send everyone an update about this table
    for (let userID in globals.connectedUsers) {
        if (globals.connectedUsers.hasOwnProperty(userID) === false) {
            continue;
        }

        // Find out if this player is seated at this table
        let joined = false;
        let our_turn = false;
        for (let i = 0; i < game.players.length; i++) {
            if (game.players[i].userID === parseInt(userID, 10)) {
                joined = true;
                data.index = i;
                break;
            }
        }

        // Find out if it is our turn
        if (joined && game.turn === data.index) {
            our_turn = true;
        }

        globals.connectedUsers[userID].emit('message', {
            type: 'table',
            resp: {
                allow_spec: game.allow_spec,
                id: data.gameID,
                joined: joined,
                max_players: game.max_players,
                name: game.name,
                num_players: game.players.length,
                our_turn: our_turn,
                owned: parseInt(userID, 10) === game.owner,
                running: game.running,
                variant: game.variant,
            },
        });
    }
};
exports.notifyAllTableChange = notifyAllTableChange;

const notifyGameMemberChange = function(data) {
    // Local variables
    let game = globals.currentGames[data.gameID];

    // Send the people in the game an update about the new player
    for (let player of game.players) {
        player.socket.emit('message', {
            type: 'game',
            resp: {
                allow_spec: game.allow_spec,
                max_players: game.max_players,
                name: game.name,
                num_players: game.players.length,
                running: game.running,
                variant: game.variant,
            },
        });

        // Tell the client to redraw all of the lobby rectanges to account for the new player
        // (it might be wasteful, but this is how the real server appears to work)
        for (let i = 0; i < game.players.length; i++) {
            let player2 = game.players[i];

            player.socket.emit('message', {
                type: 'game_player',
                resp: {
                    best_score: player2.socket.best_score,
                    finished: player2.socket.num_finished,
                    index: i,
                    name: player2.socket.username,
                    present: game.players[i].present,
                    started: player2.socket.num_started,
                    you: (player.userID === player2.userID),
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
exports.notifyGameMemberChange = notifyGameMemberChange;
