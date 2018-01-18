/*
    Communication with the server is done through the WebSocket protocol
    The client uses a slightly modified version of the Golem WebSocket library
*/

const golem = require('../lib/golem2');
const globals = require('./globals');
const misc = require('./misc');
const modals = require('./modals');
const lobby = require('./lobby/main');
const nav = require('./lobby/nav');
const history = require('./lobby/history');
const game = require('./game/main');
const gameCommands = require('./game/commands');

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

    /*
        Define event handlers
    */

    globals.conn.on('open', (event) => {
        // We will show the lobby upon recieving the "hello" command from the server
        console.log('WebSocket connection established.');
    });

    globals.conn.on('close', (event) => {
        console.log('WebSocket connection disconnected / closed.');
        modals.errorShow('Disconnected from the server. Either your Internet hiccuped or the server restarted.');
    });

    // "socketError" is defined in "golem.js" as mapping to the WebSocket "onerror" event
    globals.conn.on('socketError', (event) => {
        console.error('WebSocket error:', event);

        if ($('#loginbox').is(':visible')) {
            this.loginFormError('Failed to connect to the WebSocket server. The server might be down!');
        }
    });

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
    window.onerror = (message, url, lineno, colno, error) => {
        // We don't want to report errors if someone is doing local development
        if (window.location.hostname === 'localhost') {
            return;
        }

        try {
            globals.conn.send('clientError', {
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

const initCommands = () => {
    globals.conn.on('hello', (data) => {
        globals.username = data.username;
        $('#login').hide();
        lobby.resetLobby();
        lobby.show();
    });

    globals.conn.on('user', (data) => {
        globals.userList[data.id] = data;
        lobby.drawUsers();
    });

    globals.conn.on('userLeft', (data) => {
        delete this.userList[data.id];
        lobby.drawUsers();
    });

    globals.conn.on('table', (data) => {
        // The baseTime comes in minutes, so convert it to milliseconds
        data.baseTime *= 1000 * 60;

        // The timePerTurn comes in seconds, so convert it to milliseconds
        data.timePerTurn *= 1000;

        globals.tableList[data.id] = data;
        lobby.drawTables();
    });

    globals.conn.on('tableGone', (data) => {
        delete globals.tableList[data.id];
        lobby.drawTables();
    });

    globals.conn.on('chat', lobby.addChat);

    globals.conn.on('chatList', (dataArray) => {
        // Reverse the order of the chat messages
        // (it is queried from the database from newest to oldest,
        // but we want the oldest message to appear first)
        dataArray.reverse();

        for (const data of dataArray) {
            data.previous = true;
            lobby.addChat(data);
        }
    });

    globals.conn.on('joined', (data) => {
        lobby.drawTables();

        $('#lobby-games').hide();
        $('#lobby-game').show();
        nav.show('game');

        lobby.showJoined();

        globals.gameID = data.gameID;
    });

    globals.conn.on('left', (data) => {
        lobby.drawTables();

        $('#lobby-game').hide();
        $('#lobby-games').show();
        nav.show('games');
    });

    globals.conn.on('game', (data) => {
        globals.game = data;
        globals.game.baseTime = data.baseTime * 1000 * 60; // Convert minutes to milliseconds
        globals.game.timePerTurn = data.timePerTurn * 1000; // Convert seconds to milliseconds
        globals.game.players.length = this.game.numPlayers;

        lobby.showJoined();
    });

    globals.conn.on('gamePlayer', (data) => {
        globals.game.players[data.index] = data;
        if (data.you) {
            globals.game.ourIndex = data.index;
        }

        lobby.showJoined();
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
            $('#lobby-game').hide();
            $('#lobby-games').show();
            nav.show('games');
        }

        $('#page-wrapper').hide();
        game.show();
        globals.currentScreen = 'game';
    });

    globals.conn.on('gameHistory', (dataArray) => {
        // data will be an array of all of the games that we have previously played
        for (const data of dataArray) {
            globals.historyList[data.id] = data;
        }

        if (globals.historyAll) {
            // The server sent us every single game played because
            // we clicked on the "Show More History" button
            history.draw();
        }
    });

    globals.conn.on('historyDetail', (data) => {
        globals.historyDetailList.push(data);
        history.drawDetails();
    });

    globals.conn.on('sound', (data) => {
        if (globals.settings.sendTurnSound) {
            misc.playSound(data.file);
        }
    });

    globals.conn.on('name', (data) => {
        globals.randomName = data.name;
    });

    globals.conn.on('error', (data) => {
        // Disconnect from the server, if connected
        if (!globals.conn) {
            globals.conn.close();
        }

        modals.errorShow(data.error);
    });

    // There are yet more command handlers for events that happen in-game
    // These will only have an effect if the current screen is equal to "game"
    gameCommands.init();
};
