/*
    A Keldon Hanabi Server Emulator
    by Zamiel

    Configuration constants are located in the "globals.js" file.
*/

// Imports
const express = require('express');
const favicon = require('serve-favicon');
const path = require('path');
const globals = require('./globals');
const logger = require('./logger');
const models = require('./models');
const messages = require('./messages');

// Express and Socket.IO
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// Welcome message
logger.info('+--------------------------+');
logger.info('| Keldon Emulator starting |');
logger.info('+--------------------------+');

// Set the view engine to ejs
app.set('view engine', 'ejs');

// By default, the views directory is "views", but we need it to be "src/views"
app.set('views', path.join(__dirname, 'views'));

// HTTP handlers
app.get('/', (req, res) => {
    res.render('index', { // This will look for "src/views/index.ejs"
    // The SocketIO websocket server address should be the same thing as the website
    // Instead of hardcoding it, we can derive it from the request variable
    // For example, if the website is "https://hanabi.live/", then the websocket URL will be "https://hanabi.live/"
    // Also note that on Heroku, "req.protocol" will be "http" because a load balancer terminates the HTTPS connection
    // We can determine if the original request was on HTTPS by looking at the "X-Forwarded-Proto" header:
    // https://devcenter.heroku.com/articles/http-routing
        websocketURL: `${req.protocol}${(req.get('X-Forwarded-Proto') === 'https' ? 's' : '')}://${req.get('host')}${req.originalUrl}`,
    });
});
app.use('/public', express.static(path.join(__dirname, '..', 'public'))); // The public directory is located in the root of the repository
app.use(favicon(path.join(__dirname, '..', 'public', 'img', 'favicon.ico')));

// Websocket handlers
io.on('connection', (socket) => {
    const { address } = socket.handshake;
    logger.info(`User connected from address "${address}".`);

    socket.on('disconnect', (reason) => {
        messages.logout.step1(socket, reason);
    });

    socket.on('message', (data) => {
        try {
            if (data.type in messages) {
                let log = `Received a "${data.type}" message`;
                if (data.type === 'login') {
                    log += '.';
                } else {
                    log += ` from user "${socket.username}".`;
                }
                logger.info(log);
                messages[data.type].step1(socket, data.resp);
            } else {
                logger.warn('Received unrecognized command:', data.type);
            }
        } catch (err) {
            logger.warn('Encoutered an error while processing message.', err.message);
            if (hasOwnProperty.call(err, 'stack')) {
                logger.warn('Stack trace:\n', err.stack);
            }
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
        logger.error(`models.games.clean failed: ${error}`);
        return;
    }

    http.listen(globals.port, () => {
        logger.info(`keldon-hanabi server listening on port ${globals.port}.`);
    });
}
