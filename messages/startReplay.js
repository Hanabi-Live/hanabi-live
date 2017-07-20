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
const notify = require('../notify');

exports.step1 = function(socket, data) {
    // Local variables
    data.gameID = data.id;

    // Set their status
    socket.status = 'Replay';
    notify.allUserChange(socket);

    // Set that they are watching a replay (on the server-side)
    socket.atTable = {
        id:         data.gameID,
        replay:     true,
        spectating: false,
    };

    // Send them a "game_start" message
    socket.emit('message', {
        type: 'game_start',
        resp: {
            replay: true,
        },
    });
};
