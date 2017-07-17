'use strict';

// Imports
const express  = require('express');
const favicon  = require('serve-favicon');
const app      = express();
const http     = require('http').Server(app);
const path     = require('path');
const io       = require('socket.io')(http);
const logger   = require('./logger');
const messages = require('./messages');
const models   = require('./models');

// Configuration
const port = 3000;

// HTTP handlers
app.get('/', function(req, res) {
    res.sendFile(__dirname + '/public/index.html');
});
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(favicon(path.join(__dirname, 'public', 'img', 'favicon.ico')));

// Websocket handlers
io.on('connection', function(socket) {
    let address = socket.handshake.address;
    logger.info('User connected from address "' + address + '".');

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
            logger.info(log);
            messages[data.type].step1(socket, data.resp);
        } else {
            logger.warn('Recieved unrecognized command:', data.type);
        }
    });
});

// Start the Discord bot
require('./discord');

// Start the Keldon listener
require('./keldon');

// Clean up any non-started games before we start
models.games.clean(initComplete);

function initComplete(error) {
    if (error !== null) {
        logger.error('Error: models.games.clean failed:', error);
        return;
    }

    // Listen
    http.listen(port, function() {
        logger.info('keldon-hanabi server listening on port ' + port + '.');
    });
}
