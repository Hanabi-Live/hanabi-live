'use strict';

// Sent when the user clicks on the "Watch Replay" button
// (the client will send a "hello" message after getting "game_start")
// "data" example:
/*
    {
        id: 15103,
    }
*/

// Imports
const messages = require('../messages');

exports.step1 = function(socket, data) {
    // Local variables
    data.gameID = data.id;

    // Set that they are "Seated"
    socket.seated = true;
    messages.join_table.notifyAllUserChange(socket);

    // Send them a "game_start" message
    socket.emit('message', {
        type: 'game_start',
        resp: {
            replay: true,
        },
    });

    // Set that they are watching a replay
    socket.atTable = {
        id:         data.gameID,
        replay:     true,
        spectating: false,
    };
};
