// Imports
const express = require('express');
const favicon = require('serve-favicon');
const path = require('path');
const globals = require('./globals');
const logger = require('./logger');
const messages = require('./messages');
const models = require('./models');

const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// Set the view engine to ejs
app.set('view engine', 'ejs');

// HTTP handlers
app.get('/', (req, res) => {
    res.render('index', { // This will look for "views/index.ejs"
        websocketURL: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    });
});
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(favicon(path.join(__dirname, 'public', 'img', 'favicon.ico')));

// Websocket handlers
io.on('connection', (socket) => {
    const address = socket.handshake.address;
    logger.info(`User connected from address "${address}".`);

    socket.on('disconnect', (reason) => {
        messages.logout.step1(socket, reason);
    });

    socket.on('message', (data) => {
        if (data.type in messages) {
            let log = `Recieved a "${data.type}" message`;
            if (data.type === 'login') {
                log += '.';
            } else {
                log += ` from user "${socket.username}".`;
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

    http.listen(globals.port, () => {
        logger.info(`keldon-hanabi server listening on port ${globals.port}.`);
    });
}
