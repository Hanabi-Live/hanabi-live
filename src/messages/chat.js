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
    if (data.discord) {
        text += 'DISCORD ';
    }
    if (socket.userID !== 1 || data.discord) {
        text += `<${socket.username}> `;
    }
    text += data.msg;
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
            },
        });
    }

    // Send the chat message to the Discord "#general" channel
    // (but don't send Discord messages that we are already replicating)
    if (!data.discord) {
        discord.send('Hanabi Live', socket.username, data.msg);
    }
}
