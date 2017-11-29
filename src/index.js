/*
    A Keldon Hanabi Server Emulator
    by Zamiel

    Configuration constants are located in the "globals.js" file.
*/

// Imports
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const express = require('express');
const favicon = require('serve-favicon');
const socketIO = require('socket.io');

const logger = require('./logger');
const messages = require('./messages');

// Welcome message
logger.info('+--------------------------+');
logger.info('| Keldon Emulator starting |');
logger.info('+--------------------------+');

// Initialize Express (HTTP framework) and Socket.IO (websocket framework)
const app = express();
let httpServer;
let port;
if (process.env.TLS_CERT_FILE) {
    const credentials = {
        cert: fs.readFileSync(process.env.TLS_CERT_FILE),
        key: fs.readFileSync(process.env.TLS_KEY_FILE),
    };
    httpServer = https.createServer(credentials, app);
    port = 443;

    // Create an HTTP to HTTPS redirect
    const redirectApp = express();
    const redirectServer = http.createServer(redirectApp);
    redirectServer.listen(80);
    redirectApp.get('*', (req, res) => {
        res.redirect(`https:${req.headers.host}${req.url}`);
    });
} else {
    httpServer = http.createServer(app);
    port = 80;
}
if (process.env.PORT) {
    // In Heroku, the PORT environment variable will be specified
    port = process.env.PORT;
}
const websocketServer = socketIO(httpServer);

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
app.use(favicon(path.join(__dirname, '..', 'public', 'img', 'favicon.png')));

// Websocket handlers
websocketServer.on('connection', (socket) => {
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

httpServer.listen(port, () => {
    logger.info(`keldon-hanabi server listening on port ${port}.`);
});
