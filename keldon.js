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
    type: "login",
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
    // Validate that the message has a type
    if ('type' in msg === false) {
        return;
    }

    if (msg.type === 'chat') {
        if ('resp' in msg === false) {
            return;
        }

        if ('who' in msg.resp === false) {
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

        if ('msg' in msg.resp === false) {
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
