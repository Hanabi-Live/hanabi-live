'use strict';

// Imports
const express  = require('express');
const favicon  = require('serve-favicon');
const app      = express();
const http     = require('http').Server(app);
const path     = require('path');
const io       = require('socket.io')(http);
const dotenv   = require('dotenv').config();
const globals  = require('./globals');
const messages = require('./messages');
const models   = require('./models');

// Configuration
const port = 3000;

// HTTP handlers
app.get('/', function(req, res) {
    res.sendFile(__dirname + '/index.html');
});
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(favicon(path.join(__dirname, 'public', 'img', 'favicon.ico')));

// Websocket handlers
io.on('connection', function(socket) {
    let address = socket.handshake.address;
    console.log('User connected from address "' + address + '".');

    socket.on('disconnect', function(reason) {
        messages.logout.step1(socket, reason);
    });

    socket.on('message', function(data) {
        if (data.type in messages) {
            let log = 'Recieved a "' + data.type + '" message';
            if (data.type === 'login') {
                log += '.';
            } else {
                log += ' from user "' + socket.username + '".';
            }
            console.log(log);
            messages[data.type].step1(socket, data.resp);
        } else {
            console.log('Recieved unrecognized command:', data.type);
        }
    });
});

// Clean up any non-started games before we start
models.games.clean(initComplete);

function initComplete(error) {
    if (error !== null) {
        console.error('Error: models.games.clean failed:', error);
        return;
    }

    // Listen
    http.listen(port, function() {
        console.log('keldon-hanabi server listening on port ' + port + '.');
    });
}
