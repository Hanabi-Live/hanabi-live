// Sent when the user sends a text message to the lobby by pressing enter
// "data" example:
/*
    {
        msg: "hi",
    }
*/

// Imports
const globals = require('../globals');
const logger = require('../logger');
const models = require('../models');
const discord = require('../discord');
const debug = require('../debug');

exports.step1 = (socket, data) => {
    // Validate the message
    if (typeof data.msg !== 'string') {
        logger.error('Malformed chat message input.');
        return;
    }

    // Truncate long messages
    const maxLength = 150;
    if (data.msg.length > maxLength) {
        data.msg = data.msg.substring(0, maxLength);
    }

    // Add the message to the database
    models.chatLog.create(socket, data, step2);
};

function step2(error, socket, data) {
    if (error !== null) {
        logger.error(`models.games.create failed: ${error}`);
        return;
    }

    let text = '';
    if (socket.userID === 1) {
        text += 'DISCORD ';
    }
    text += `<${socket.username}> ${data.msg}`;
    logger.info(text);

    // Check for debug commands
    if (data.msg === '!debug') {
        debug.step1(socket, data);
        return;
    }

    // Send the chat message to everyone
    for (const userID of Object.keys(globals.connectedUsers)) {
        globals.connectedUsers[userID].emit('message', {
            type: 'chat',
            resp: {
                msg: data.msg,
                who: socket.username,
                discord: (socket.userID === 1),
            },
        });
    }

    // Send the chat message to the Discord "#general" channel
    // (only if it is not a server message)
    if (socket.userID !== 1) {
        discord.send('Emulator-Lobby', socket.username, data.msg);
    }
}
