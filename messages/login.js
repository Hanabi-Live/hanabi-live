'use strict';

// Sent when the user clicks on the "Login" button
// "data" example:
/*
    {
        password: "23628c952a47e5b7150384548fa02e8473789bbe22f7fd5e499078bdb0fd1d15",
        username: "test",
    }
*/

// Imports
const globals  = require('../globals');
const logger   = require('../logger');
const models   = require('../models');
const notify   = require('../notify');

exports.step1 = function(socket, data) {
    // Get the password (and other data) for this user
    models.users.getUser(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.users.getPassword failed:', error);
        return;
    }

    if (data.userID === null) {
        // This user does not exist, so create it
        logger.info('Creating user:', data.username);
        models.users.create(socket, data, step3);
    } else {
        // Check to see if the password matches
        if (data.password === data.realPassword) {
            step4(socket, data);
        } else {
            logger.info('User "' + data.username + '" supplied an incorrect password of:', data.password);

            // Let them know
            socket.emit('message', {
                type: 'denied',
                resp: {
                    reason: 'Incorrect password',
                },
            });
        }
    }
}

function step3(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.users.create failed:', error);
        return;
    }

    logger.info('User "' + data.username + '" created.');
    step4(socket, data);
}

function step4(socket, data) {
    // Store information about the user inside of the socket object
    socket.userID = data.userID; // We can't use "socket.id" because Socket.IO already uses that as a unique identifier for the session
    socket.username = data.username;
    socket.atTable = {
        id:         -1,
        replay:     false,
        spectating: false,
    };
    socket.status = 'In Lobby';
    socket.num_started = data.num_started;
    socket.num_finished = data.num_finished;
    socket.best_score = data.best_score;

    // Check to see if this user is already logged on
    if (socket.userID in globals.connectedUsers) {
        logger.info('User "' + socket.username + '" logged in but was already connected; logging the existing user out."');

        // Send the existing user a "kick" message
        globals.connectedUsers[socket.userID].emit('message', {
            type: 'kick',
            resp: {
                reason: 'new login',
            }
        });
        globals.connectedUsers[socket.userID].disconnect(true);
    }

    // Keep track of the connecting user
    globals.connectedUsers[data.userID] = socket;
    logger.info('User "' + data.username + '" logged in. (' + Object.keys(globals.connectedUsers).length, 'now connected.)');

    // Check to see if this user was in any existing games
    for (let gameID in globals.currentGames) {
        let game = globals.currentGames[gameID];
        for (let player of game.players) {
            if (player.username === socket.username) {
                // Update their socket with the new socket
                player.socket = socket;
            }
        }
    }

    // They have successfully logged in, so send initial messages to the client
    socket.emit('message', {
        type: 'hello',
    });

    // Alert everyone that a new user has logged in
    // (note that Keldon sends users a message about themselves)
    notify.allUserChange(socket);

    // Send a "user" message for every currently connected user
    for (let userID in globals.connectedUsers) {
        if (globals.connectedUsers.hasOwnProperty(userID) === false) {
            continue;
        }

        // Skip sending a message about ourselves since we already sent that
        if (globals.connectedUsers[userID].username === socket.username) {
            continue;
        }

        // Keys are strings by default, so convert it back to a number
        userID = parseInt(userID, 10);

        socket.emit('message', {
            type: 'user',
            resp: {
                id:     userID,
                name:   globals.connectedUsers[userID].username,
                status: globals.connectedUsers[userID].status,
            },
        });
    }

    // Send a "table" message for every current table
    for (let gameID in globals.currentGames) {
        if (globals.currentGames.hasOwnProperty(gameID) === false) {
            continue;
        }

        // Keys are strings by default, so convert it back to a number
        gameID = parseInt(gameID, 10);

        // Find out if this player is seated at this table
        let game = globals.currentGames[gameID];
        let joined = false;
        let our_turn = false;
        let index;
        for (let i = 0; i < game.players.length; i++) {
            if (game.players[i].userID === socket.userID) {
                joined = true;
                index = i;
                break;
            }
        }

        // Find out if it is our turn
        if (joined && game.running && game.turn_player_index === index) {
            our_turn = true;
        }

        socket.emit('message', {
            type: 'table',
            resp: {
                allow_spec: game.allow_spec,
                id: gameID,
                joined: joined,
                max_players: game.max_players,
                name: game.name,
                num_players: game.players.length,
                our_turn: our_turn,
                owned: (socket.userID === game.owner),
                running: game.running,
                variant: game.variant,
            },
        });
    }

    // Send the welcome chat messages
    socket.emit('message', {
        type: 'chat',
        resp: {
            msg: 'Welcome to Hanabi',
            who: null,
        },
    });
    socket.emit('message', {
        type: 'chat',
        resp: {
            msg: 'Send bugs or comments to your mom.',
            who: null,
        },
    });

    // Send the user's game history
    models.games.getUserHistory(socket, data, step5);
}

function step5(error, socket, data) {
    if (error !== null) {
        logger.error('Error: models.games.getUserHistory failed:', error);
        return;
    }

    for (let game of data.gameHistory) {
        socket.emit('message', {
            type: 'game_history',
            resp: {
                id: game.id,
                num_players: game.num_players,
                num_similar: game.num_similar,
                score: game.score,
                variant: game.variant,
            },
        });
    }
}
