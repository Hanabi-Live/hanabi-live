'use strict';

// The "logout" message is not actually sent by the client;
// we just store the logic here for organizational purposes since
// the login logic is stored under the login command

// Imports
const globals  = require('../globals');
const messages = require('../messages');

exports.step1 = function(socket, reason) {
    if (typeof(socket.userID) === 'undefined') {
        console.log('Non-logged in user disconnected:', reason);
        return;
    }

    let address = socket.handshake.address;
    let leftID = socket.userID;

    // Check to see if this user was in any games
    for (let gameID in globals.currentGames) {
        if (globals.currentGames.hasOwnProperty(gameID) === false) {
            continue;
        }

        let game = globals.currentGames[gameID];

        // Keys are strings by default, so convert it back to a number
        gameID = parseInt(gameID, 10);

        for (let player of game.players) {
            if (player.userID === socket.userID) {
                if (game.running) {
                    // Set their "present" variable to false, which will turn their name red
                    player.present = false;
                    messages.join_table.notifyGameMemberChange({
                        gameID: gameID,
                    });

                    // Set their "seated" and "playing" variables to false, which control the checkboxes in the lobby
                    socket.seated = false;
                    socket.playing = false;
                    messages.join_table.notifyAllUserChange(socket);

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
            }
        }
    }

    // Keep track of the disconnecting user
    delete globals.connectedUsers[socket.userID];

    console.log('User "' + socket.username + '" disconnected from "' + address + '". (' + Object.keys(globals.connectedUsers).length, 'users now connected.)');

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
