'use strict';

// Imports
const client  = require('socket.io-client');
const discord = require('./discord');

// Import the environment variables defined in the ".env" file
require('dotenv').config();

// Configuration
const url       = 'http://keldon.net:32221/';
const username  = process.env.KELDON_USER;
const password  = process.env.KELDON_PASS;

// Connect
var socket = client.connect(url);
socket.emit('message', {
    type: 'login',
    resp: {
        username: username,
        password: password,
    },
});

/*
    SocketIO callbacks
*/

// Look for chat messages
// E.g. { type: 'chat', resp: { who: 'Zamiel', msg: 'hi' } }
socket.on('message', function(msg) {
    // Debug
    /*
    console.log('Received a Keldon message:');
    console.log(msg);
    */

    // Validate that the message has a type
    if (!('type' in msg)) {
        return;
    }

    if (msg.type === 'chat') {
        if (!('resp' in msg)) {
            return;
        }

        if (!('who' in msg.resp)) {
            return;
        }

        if (msg.resp.who === null) {
            // Filter out server messages
            // E.g. "Welcome to Hanabi"
            return;
        }

        if (typeof(msg.resp.who) !== 'string') {
            return;
        }

        if (msg.resp.who.length === 0) {
            return;
        }

        if (msg.resp.who === process.env.KELDON_USER) {
            // Filter out messages from ourselves
            return;
        }

        if (!('msg' in msg.resp)) {
            return;
        }

        if (typeof(msg.resp.msg) !== 'string') {
            return;
        }

        if (msg.resp.msg.length === 0) {
            return;
        }

        discord.send('Keldon-Lobby', msg.resp.who, msg.resp.msg);
    }
});

exports.sendChat = function(msg) {
    // Note that we can send the message, but none of the other users in the
    // lobby will recieve our text because the IP address that is currently
    // hosting the server is banned
    socket.emit('message', {
        type: 'chat',
        resp: {
            msg: msg,
        },
    });
};
