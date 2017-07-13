'use strict';

// The "logout" message is not actually sent by the client;
// we just store the logic here for organizational purposes since
// the login logic is stored under the "login" command

// Imports
const globals  = require('../globals');
const logger   = require('../logger');
const messages = require('../messages');
const notify   = require('../notify');

exports.step1 = function(socket, reason) {
    if (typeof(socket.userID) === 'undefined') {
        logger.info('Non-logged in user disconnected:', reason);
        return;
    }

    let address = socket.handshake.address;
    let leftID = socket.userID;

    for (let gameID in globals.currentGames) {
        if (globals.currentGames.hasOwnProperty(gameID) === false) {
            continue;
        }

        let game = globals.currentGames[gameID];

        // Keys are strings by default, so convert it back to a number
        gameID = parseInt(gameID, 10);

        // Check to see if this user is playing in any current games
        for (let player of game.players) {
            if (player.userID === socket.userID) {
                if (game.running) {
                    // Set their "present" variable to false, which will turn their name red
                    player.present = false;
                    notify.gameMemberChange({
                        gameID: gameID,
                    });

                    // Set their status
                    socket.status = 'Lobby';
                    notify.allUserChange(socket);

                } else {
                    // The game has not started yet, so just eject them from the table
                    // The "leave_table" message is sent with no data;
                    // the server uses the "atTable" object to find out which table the user is leaving
                    socket.atTable = {
                        id:         gameID,
                        replay:     false,
                        spectating: false,
                    };
                    messages.leave_table.step1(socket, {});
                }
                break;
            }
        }

        // Check to see if this player is spectating any current games
        for (let userID in game.spectators) {
            if (game.spectators.hasOwnProperty(userID) === false) {
                continue;
            }

            // Keys are strings by default, so convert it back to a number
            userID = parseInt(userID, 10);

            if (userID === socket.userID) {
                socket.atTable = {
                    id:         gameID,
                    replay:     false,
                    spectating: true,
                };
                messages.unattend_table.step1(socket, {});
            }
            break;
        }
    }

    // Keep track of the disconnecting user
    delete globals.connectedUsers[socket.userID];

    logger.info('User "' + socket.username + '" disconnected from "' + address + '". (' + Object.keys(globals.connectedUsers).length, 'users now connected.)');

    // Send a "user_left" message to everyone to let them know that a user has disconnected
    for (let userID in globals.connectedUsers) {
        if (globals.connectedUsers.hasOwnProperty(userID) === false) {
            continue;
        }

        globals.connectedUsers[userID].emit('message', {
            type: 'user_left',
            resp: {
                id: leftID,
            },
        });
    }
};
