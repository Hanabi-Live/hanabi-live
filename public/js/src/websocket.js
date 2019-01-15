/*
    Communication with the server is done through the WebSocket protocol
    The client uses a slightly modified version of the Golem WebSocket library
*/

// Imports
const golem = require('../lib/golem2');
const globals = require('./globals');
const modals = require('./modals');
const chat = require('./chat');
const lobby = require('./lobby/main');
const game = require('./game/main');

exports.set = () => {
    // Connect to the WebSocket server
    let websocketURL = 'ws';
    if (window.location.protocol === 'https:') {
        websocketURL += 's';
    }
    websocketURL += '://';
    websocketURL += window.location.hostname;
    if (window.location.port !== '') {
        websocketURL += ':';
        websocketURL += window.location.port;
    }
    websocketURL += '/ws';
    console.log('Connecting to websocket URL:', websocketURL);
    globals.conn = new golem.Connection(websocketURL, true);
    // This will automatically use the cookie that we recieved earlier from the POST
    // If the second argument is true, debugging is turned on

    // Define event handlers
    globals.conn.on('open', () => {
        // We will show the lobby upon recieving the "hello" command from the server
        console.log('WebSocket connection established.');
    });
    globals.conn.on('close', () => {
        console.log('WebSocket connection disconnected / closed.');
        modals.errorShow('Disconnected from the server. Either your Internet hiccuped or the server restarted.');
    });
    globals.conn.on('socketError', (event) => {
        // "socketError" is defined in "golem.js" as mapping to the WebSocket "onerror" event
        console.error('WebSocket error:', event);

        if ($('#loginbox').is(':visible')) {
            lobby.login.formError('Failed to connect to the WebSocket server. The server might be down!');
        }
    });

    // All of the normal commands/messages that we expect from the server are defined in the
    // "initCommands()" function
    initCommands();

    globals.conn.send = (command, data) => {
        if (typeof data === 'undefined') {
            data = {};
        }
        if (globals.debug) {
            console.log(`%cSent ${command}:`, 'color: green;');
            console.log(data);
        }
        globals.conn.emit(command, data);
    };

    // Send any client errors to the server for tracking purposes
    window.onerror = (message, url, lineno, colno) => {
        // We don't want to report errors if someone is doing local development
        if (window.location.hostname === 'localhost') {
            return;
        }

        try {
            globals.conn.emit('clientError', {
                message,
                url,
                lineno,
                colno,
            });
        } catch (err) {
            console.error('Failed to transmit the error to the server:', err);
        }
    };
};

// This is all of the normal commands/messages that we expect to receive from the server
const initCommands = () => {
    globals.conn.on('hello', (data) => {
        globals.username = data.username;
        globals.totalGames = data.totalGames;
        $('#nav-buttons-history-game-count').html(globals.totalGames);
        $('#login').hide();
        lobby.login.hide();
    });

    globals.conn.on('user', (data) => {
        globals.userList[data.id] = data;
        lobby.users.draw();
    });

    globals.conn.on('userLeft', (data) => {
        delete globals.userList[data.id];
        lobby.users.draw();
    });

    globals.conn.on('table', (data) => {
        // The baseTime comes in minutes, so convert it to milliseconds
        data.baseTime *= 1000 * 60;

        // The timePerTurn comes in seconds, so convert it to milliseconds
        data.timePerTurn *= 1000;

        globals.tableList[data.id] = data;
        lobby.tables.draw();
    });

    globals.conn.on('tableGone', (data) => {
        delete globals.tableList[data.id];
        lobby.tables.draw();
    });

    globals.conn.on('chat', chat.add);

    globals.conn.on('chatList', (dataArray) => {
        // Reverse the order of the chat messages
        // (it is queried from the database from newest to oldest,
        // but we want the oldest message to appear first)
        dataArray.reverse();

        for (const data of dataArray) {
            chat.add(data);
        }
    });

    globals.conn.on('joined', (data) => {
        // We joined a new game, so transition between screens
        globals.gameID = data.gameID;
        lobby.tables.draw();
        lobby.pregame.show();
    });

    globals.conn.on('left', () => {
        // We left a table, so transition between screens
        globals.gameID = null;
        lobby.tables.draw();
        lobby.pregame.hide();
    });

    globals.conn.on('game', (data) => {
        globals.game = data;

        // This comes from the server in minutes, so convert it to milliseconds
        globals.game.baseTime = data.baseTime * 1000 * 60;

        // This comes from the server in seconds, so convert it to milliseconds
        globals.game.timePerTurn = data.timePerTurn * 1000;

        lobby.pregame.draw();
    });

    globals.conn.on('tableReady', (data) => {
        if (data.ready) {
            $('#nav-buttons-game-start').removeClass('disabled');
        } else {
            $('#nav-buttons-game-start').addClass('disabled');
        }
    });

    globals.conn.on('gameStart', (data) => {
        if (!data.replay) {
            lobby.pregame.hide();
        }
        game.show(data.replay);
    });

    globals.conn.on('gameHistory', (dataArray) => {
        // data will be an array of all of the games that we have previously played
        for (const data of dataArray) {
            globals.historyList[data.id] = data;
        }

        // The server sent us more games because
        // we clicked on the "Show More History" button
        if (globals.historyClicked) {
            globals.historyClicked = false;
            lobby.history.draw();
        }
    });

    globals.conn.on('historyDetail', (data) => {
        globals.historyDetailList.push(data);
        lobby.history.drawDetails();
    });

    globals.conn.on('sound', (data) => {
        if (globals.settings.sendTurnSound) {
            game.sounds.play(data.file);
        }
    });

    globals.conn.on('name', (data) => {
        globals.randomName = data.name;
    });

    globals.conn.on('warning', (data) => {
        // Log the warning message
        console.warn(data.warning);

        // Show the warning modal
        modals.warningShow(data.warning);
    });

    globals.conn.on('error', (data) => {
        // Log the error message
        console.error(data.error);

        // Disconnect from the server, if connected
        if (!globals.conn) {
            globals.conn.close();
        }

        modals.errorShow(data.error);
    });

    // There are yet more command handlers for events that happen in-game
    // These will only have an effect if the current screen is equal to "game"
    game.commands.init();
};
