'use strict';

// Sent when the user clicks on the "Spectate" button in the lobby
// (the client will send a "hello" message after getting "game_start")
// "data" example:
/*
    {
        table_id: 15103,
    }
*/

// Imports
const globals  = require('../globals');
const messages = require('../messages');

exports.step1 = function(socket, data) {
    // Local variables
    data.gameID = data.table_id;

    // Validate that this table exists
    if (data.gameID in globals.currentGames === false) {
        return;
    }

    let game = globals.currentGames[data.gameID];

    // Add them to the spectators object
    game.spectators[socket.userID] = socket;

    // Set that they are "Seated"
    socket.seated = true;
    messages.join_table.notifyAllUserChange(socket);

    // Send them a "game_start" message
    socket.emit('message', {
        type: 'game_start',
        resp: {
            replay: false,
        },
    });

    // Set that they are spectating (internally)
    socket.atTable = {
        id:         data.gameID,
        replay:     false,
        spectating: true,
    };
};
