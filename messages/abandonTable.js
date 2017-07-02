'use strict';

// Sent when the user clicks the "X" button next to the table in the lobby
// "data" example:
/*
    {
        table_id: 594,
    }
*/

// Imports
const globals  = require('../globals');
const messages = require('../messages');

exports.step1 = function(socket, data) {
    // Local variables
    data.gameID = data.table_id;
    let game = globals.currentGames[data.gameID];

    // Validate that this table exists
    if (data.gameID in globals.currentGames === false) {
        console.log("(Table does not exist.)");
        return;
    }

    // Update everyone's "Seated" and "Playing" values
    for (let player of game.players) {
        player.socket.seated = false;
        player.socket.playing = false;
        player.socket.atTable = {
            id:         -1,
            replay:     false,
            spectating: false,
        };
        messages.join_table.notifyAllUserChange(player.socket);
    }

    // Keep track of the game ending
    console.log('Game: #' + data.gameID + ' (' + game.name + ') ended with a score of ' + game.score + '.');
    delete globals.currentGames[data.gameID];

    // Notify everyone that the table was deleted
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
