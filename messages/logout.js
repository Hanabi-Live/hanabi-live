// The "logout" message is not actually sent by the client;
// we just store the logic here for organizational purposes since
// the login logic is stored under the "login" command

// Imports
const globals = require('../globals');
const logger = require('../logger');
const messages = require('../messages');
const notify = require('../notify');

exports.step1 = (socket, reason) => {
    if (typeof socket.userID === 'undefined') {
        logger.info('Non-logged in user disconnected:', reason);
        return;
    }

    // Check to see if this user is playing (or spectating) any current games
    for (let gameID of Object.keys(globals.currentGames)) {
        const game = globals.currentGames[gameID];

        // Keys are strings by default, so convert it back to a number
        gameID = parseInt(gameID, 10);

        for (const player of game.players) {
            if (player.userID === socket.userID) {
                if (game.running) {
                    // Set their "present" variable to false, which will turn
                    // their name red
                    player.present = false;
                    notify.gameMemberChange({
                        gameID,
                    });

                    // Set their status
                    socket.status = 'Lobby';
                    notify.allUserChange(socket);
                } else {
                    // The game has not started yet, so just eject them from
                    // the table
                    // The "leave_table" message is sent with no data;
                    // the server uses the "currentGame" property to find out
                    // which table the user is leaving
                    socket.currentGame = gameID;
                    messages.leave_table.step1(socket, {});
                }
                break;
            }
        }

        for (let userID of Object.keys(game.spectators)) {
            // Keys are strings by default, so convert it back to a number
            userID = parseInt(userID, 10);

            if (userID === socket.userID) {
                socket.currentGame = gameID;
                socket.status = (game.shared_replay ? 'Shared Replay' : 'Spectating');
                messages.unattend_table.step1(socket, {});
                break;
            }
        }
    }

    // Keep track of the disconnecting user
    delete globals.connectedUsers[socket.userID];

    logger.info(`User "${socket.username}" disconnected. (${Object.keys(globals.connectedUsers).length} users now connected.)`);

    // Send a "user_left" message to everyone to let them know that a user has disconnected
    for (const userID of Object.keys(globals.connectedUsers)) {
        globals.connectedUsers[userID].emit('message', {
            type: 'user_left',
            resp: {
                id: socket.userID,
            },
        });
    }
};
