'use strict';

// Sent when the user clicks on the "Resume" button in the lobby
// "data" example:
/*
    {
        table_id: 31,
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
        return;
    }

    // Set their "present" variable back to true, which will turn their name from red to black
    for (let player of game.players) {
        if (player.userID === socket.userID) {
            player.present = true;
            break;
        }
    }
    messages.start_game.notifyGameConnected(data);

    // Set their "seated" and "playing" variables to true, which control the checkboxes in the lobby
    socket.seated = true;
    socket.playing = true;
    messages.join_table.notifyAllUserChange(socket);

    // Mark that they have joined the table
    socket.atTable = {
        id:         data.gameID,
        replay:     false,
        spectating: false,
    };

    // Make the client switch screens to show the game UI
    socket.emit('message', {
        type: 'joined',
        resp: {
            table_id: data.gameID,
        },
    });
    socket.emit('message', {
        type: 'game_start',
        resp: {
            replay: false,
        },
    });
};
