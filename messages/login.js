// Sent when the user clicks on the "Login" button
// "data" example:
/*
    {
        username: "test",
        password: "23628c952a47e5b7150384548fa02e8473789bbe22f7fd5e499078bdb0fd1d15",
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const models = require('../models');
const messages = require('../messages');
const notify = require('../notify');

exports.step1 = (socket, data) => {
    // Validate that they submitted a username
    if (!('username' in data)) {
        logger.warn('Someone tried to log in without submitting a username.');
        data.reason = 'You must submit a username.';
        notify.playerDenied(socket, data);
        return;
    }

    // Validate that they submitted a password
    if (!('password' in data)) {
        logger.warn('Someone tried to log in without submitting a password.');
        data.reason = 'You must submit a password.';
        notify.playerDenied(socket, data);
        return;
    }

    // Validate that the username is not blank
    if (data.username.length === 0) {
        logger.warn('Someone tried to log in with a blank username.');
        data.reason = 'Username cannot be blank.';
        notify.playerDenied(socket, data);
        return;
    }

    // Validate that the username is not excessively long
    const maxLength = 15;
    if (data.username.length > maxLength) {
        logger.warn(`User "${data.username}" supplied an excessively long username with a length of ${data.username.length}.`);
        data.reason = `Username must be ${maxLength} characters or less.`;
        notify.playerDenied(socket, data);
        return;
    }

    // Get the password (and other data) for this user
    models.users.getUser(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error(`models.users.getPassword failed: ${error}`);
        return;
    }

    if (data.userID === null) {
        // This user does not exist, so create it
        logger.info('Creating user:', data.username);
        models.users.create(socket, data, step3);
    } else if (data.password === data.realPassword) {
        // Check to see if the password matches
        step4(socket, data);
    } else {
        logger.info(`User "${data.username}" supplied an incorrect password of: ${data.password}`);
        data.reason = 'Incorrect password';
        notify.playerDenied(socket, data);
    }
}

function step3(error, socket, data) {
    if (error !== null) {
        logger.error(`models.users.create failed: ${error}`);
        return;
    }

    logger.info(`User "${data.username}" was created in the database.`);
    step4(socket, data);
}

function step4(socket, data) {
    // Store information about the user inside of the socket object
    socket.userID = data.userID;
    // We can't use "socket.id" because Socket.IO already uses that as a unique
    // identifier for the session
    socket.username = data.username;
    socket.currentGame = -1;
    socket.status = 'Lobby';
    socket.num_played = data.num_played;
    socket.average_score = data.average_score;
    socket.strikeout_rate = data.strikeout_rate;

    // Check to see if this user is already logged on
    if (socket.userID in globals.connectedUsers) {
        logger.info(`User "${socket.username}" logged in but was already connected; logging the existing user out.`);

        // Send the existing user a "kick" message
        globals.connectedUsers[socket.userID].emit('message', {
            type: 'kick',
            resp: {
                reason: 'new login',
            },
        });
        globals.connectedUsers[socket.userID].disconnect(true);
    }

    // Keep track of the connecting user
    globals.connectedUsers[data.userID] = socket;
    logger.info(`User "${data.username}" logged in. (${Object.keys(globals.connectedUsers).length} now connected.)`);

    // Check to see if this user was in any existing games
    for (const gameID of Object.keys(globals.currentGames)) {
        const game = globals.currentGames[gameID];
        for (const player of game.players) {
            if (player.username === socket.username) {
                // Update their socket with the new socket
                player.socket = socket;
            }
        }
    }

    // Send them a random name
    messages.get_name.step1(socket, data);

    // They have successfully logged in, so send initial messages to the client
    socket.emit('message', {
        type: 'hello',
        resp: {
            // We have to send the username back to the client because they may
            // have logged in with the wrong case, and the client needs to know
            // their exact username or various bugs will creep up
            // (on vanilla Keldon, this hello message is empty)
            username: socket.username,
        },
    });

    // Alert everyone that a new user has logged in
    // (note that Keldon sends users a message about themselves)
    notify.allUserChange(socket);

    // Send a "user" message for every currently connected user
    for (let userID of Object.keys(globals.connectedUsers)) {
        // Skip sending a message about ourselves since we already sent that
        if (globals.connectedUsers[userID].username === socket.username) {
            continue;
        }

        // Keys are strings by default, so convert it back to a number
        userID = parseInt(userID, 10);

        socket.emit('message', {
            type: 'user',
            resp: {
                id: userID,
                name: globals.connectedUsers[userID].username,
                status: globals.connectedUsers[userID].status,
            },
        });
    }

    // Send a "table" message for every current table
    for (const gameID of Object.keys(globals.currentGames)) {
        data.gameID = gameID;
        notify.playerTable(socket, data);
    }

    // Send the welcome chat messages
    // (Keldon sends these, but they seem rather useless and spammy, so we won't
    // send these)
    /*
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
    */

    // Send the user's game history
    models.games.getUserHistory(socket, data, step5);
}

function step5(error, socket, data) {
    if (error !== null) {
        logger.error(`models.games.getUserHistory failed: ${error}`);
        return;
    }

    for (const game of data.gameHistory) {
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
