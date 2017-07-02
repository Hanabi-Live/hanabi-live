'use strict';

// Sent when the user sends a text message to the lobby by pressing enter
// "data" example:
/*
    {
        msg: "hi",
    }
*/

// Imports
const globals = require('../globals');
const models  = require('../models');

exports.step1 = function(socket, data) {
    // Validate the message
    if (typeof(data.msg) !== 'string') {
        console.error('Error: Malformed chat message input.');
        return;
    } else if (data.msg.length > 150) {
        console.error('Error: Chat message over 150 characters.');
        return;
    }

    // Add the message to the database
    models.chatLog.create(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        console.error('Error: models.games.create failed:', error);
        return;
    }

    console.log('<' + socket.username + '> ' + data.msg);

    // Send the chat message to everyone
    for (let userID in globals.connectedUsers) {
        if (globals.connectedUsers.hasOwnProperty(userID) === false) {
            continue;
        }

        globals.connectedUsers[userID].emit('message', {
            type: 'chat',
            resp: {
                msg: data.msg,
                who: socket.username,
            },
        });
    }
}
