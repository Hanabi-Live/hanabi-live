/*
    Communication with the server is done through the WebSocket protocol
    The client uses a slightly modified version of the Golem WebSocket library
*/

// Imports
const golem = require('../lib/golem');
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
        $('#nav-buttons-history-total-games').html(globals.totalGames);
        lobby.login.hide(data.firstTimeUser);
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
        // The baseTime and timePerTurn come in seconds, so convert them to milliseconds
        data.baseTime *= 1000;
        data.timePerTurn *= 1000;

        globals.tableList[data.id] = data;
        lobby.tables.draw();
    });

    globals.conn.on('tableGone', (data) => {
        delete globals.tableList[data.id];
        lobby.tables.draw();
    });

    globals.conn.on('chat', (data) => {
        chat.add(data, false); // The second argument is "fast"
        if (
            data.room === 'game'
            && globals.ui !== null
            && !$('#game-chat-modal').is(':visible')
        ) {
            if (globals.ui.globals.spectating && !globals.ui.globals.sharedReplay) {
                // Pop up the chat window every time for spectators
                globals.ui.toggleChat();
            } else {
                // Do not pop up the chat window by default;
                // instead, change the "Chat" button to say "Chat (1)"
                globals.chatUnread += 1;
                globals.ui.updateChatLabel();
            }
        }
    });

    // The "chatList" command is sent upon initial connection
    // to give the client a list of past lobby chat messages
    // It is also sent upon connecting to a game to give a list of past in-game chat messages
    globals.conn.on('chatList', (data) => {
        for (const line of data.list) {
            chat.add(line, true); // The second argument is "fast"
        }
        if (
            // If the UI is open, we assume that this is a list of in-game chat messages
            globals.ui !== null
            && !$('#game-chat-modal').is(':visible')
        ) {
            globals.chatUnread += data.unread;
            globals.ui.updateChatLabel();
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

        // The baseTime and timePerTurn come in seconds, so convert them to milliseconds
        globals.game.baseTime *= 1000;
        globals.game.timePerTurn *= 1000;

        lobby.pregame.draw();
    });

    globals.conn.on('tableReady', (data) => {
        if (data.ready) {
            $('#nav-buttons-pregame-start').removeClass('disabled');
        } else {
            $('#nav-buttons-pregame-start').addClass('disabled');
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

            if (data.incrementNumGames) {
                globals.totalGames += 1;
            }
        }

        // The server sent us more games because
        // we clicked on the "Show More History" button
        if (globals.historyClicked) {
            globals.historyClicked = false;
            lobby.history.draw();
        }

        const shownGames = Object.keys(globals.historyList).length;
        $('#nav-buttons-history-shown-games').html(shownGames);
        $('#nav-buttons-history-total-games').html(globals.totalGames);
        if (shownGames === globals.totalGames) {
            $('#lobby-history-show-more').hide();
        }
    });

    globals.conn.on('historyDetail', (data) => {
        globals.historyDetailList.push(data);
        lobby.history.drawDetails();
    });

    globals.conn.on('sound', (data) => {
        if (globals.settings.sendTurnSound && globals.currentScreen === 'game') {
            game.sounds.play(data.file);
        }
    });

    globals.conn.on('name', (data) => {
        globals.randomName = data.name;
    });

    globals.conn.on('warning', (data) => {
        console.warn(data.warning);
        modals.warningShow(data.warning);
    });

    globals.conn.on('error', (data) => {
        console.error(data.error);
        modals.errorShow(data.error);

        // Disconnect from the server, if connected
        if (!globals.conn) {
            globals.conn.close();
        }
    });

    // There are yet more command handlers for events that happen in-game
    // These will only have an effect if the current screen is equal to "game"
    game.websocket.init();
};
