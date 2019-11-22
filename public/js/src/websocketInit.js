/*
    Communication with the server is done through the WebSocket protocol
    The client uses a slightly modified version of the Golem WebSocket library
*/

// Imports
import * as chat from './chat';
import * as gameChat from './game/chat';
import * as gameMain from './game/main';
import * as gameSounds from './game/sounds';
import gameWebsocketInit from './game/websocketInit';
import Connection from './Connection';
import globals from './globals';
import * as lobbyHistory from './lobby/history';
import * as lobbyLoginMisc from './lobby/loginMisc';
import * as lobbyPregame from './lobby/pregame';
import * as lobbySettings from './lobby/settings';
import lobbyTablesDraw from './lobby/tablesDraw';
import lobbyUsersDraw from './lobby/usersDraw';
import * as modals from './modals';

export default () => {
    // Prepare the URL of the WebSocket server
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

    // Connect to the WebSocket server
    // This will automatically use the cookie that we received earlier from the POST
    // If the second argument is true, debugging is turned on
    console.log('Connecting to websocket URL:', websocketURL);
    globals.conn = new Connection(websocketURL, true);

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
        // "socketError" is defined in the Connection object as mapping to
        // the WebSocket "onerror" event
        console.error('WebSocket error:', event);

        if ($('#loginbox').is(':visible')) {
            lobbyLoginMisc.formError('Failed to connect to the WebSocket server. The server might be down!');
        }
    });

    // All of the normal commands/messages that we expect from the server are defined in the
    // "initCommands()" function
    initCommands();

    globals.conn.send = (command, data) => {
        if (typeof data === 'undefined') {
            data = {};
        }
        console.log(`%cSent ${command}:`, 'color: green;');
        console.log(data);
        globals.conn.emit(command, data);
    };

    // Send any client errors to the server for tracking purposes
    window.onerror = (message, url, lineno, colno) => {
        // We don't want to report errors during local development
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
        // Store variables relating to our user account on the server
        globals.username = data.username; // We might have logged-in with a different stylization
        globals.totalGames = data.totalGames;
        globals.settings = data.settings;

        // Some settings are stored on the server as numbers,
        // but we need them as strings because they will exist in an input field
        const valuesToConvertToStrings = [
            'createTableBaseTimeMinutes',
            'createTableTimePerTurnSeconds',
        ];
        for (const value of valuesToConvertToStrings) {
            globals.settings[value] = globals.settings[value].toString();
        }

        // Update various elements of the UI to reflect our settings
        $('#nav-buttons-history-total-games').html(globals.totalGames);
        lobbySettings.setSettingsTooltip();
        lobbyLoginMisc.hide(data.firstTimeUser);

        if (!data.firstTimeUser) {
            // Validate that we are on the latest JavaScript code
            if (
                data.version !== globals.version
                // If the server is gracefully shutting down, then ignore the version check because
                // the new client code is probably not compiled yet
                && !data.shuttingDown
                && !window.location.pathname.includes('/dev')
            ) {
                let msg = 'You are running an outdated version of the Hanabi client code. ';
                msg += `(You are on <i>v${globals.version}</i> and the latest is <i>v${data.version}</i>.)<br />`;
                msg += 'Please perform a hard-refresh to get the latest version.<br />';
                msg += '(On Windows, the hotkey for this is "Ctrl + F5". ';
                msg += 'On MacOS, the hotkey for this is "Command + Shift + R".)';
                modals.warningShow(msg);
                return;
            }

            // Automatically go into a replay if surfing to "/replay/123"
            let gameID = null;
            const match = window.location.pathname.match(/\/replay\/(\d+)/);
            if (match) {
                gameID = match[1];
            } else if (window.location.pathname === '/dev2') {
                gameID = '51'; // The first game in the Hanabi Live database
            }
            if (gameID !== null) {
                setTimeout(() => {
                    gameID = parseInt(gameID, 10); // The server expects this as an integer
                    globals.conn.send('replayCreate', {
                        gameID,
                        source: 'id',
                        visibility: 'solo',
                    });
                }, 10);
            }
        }
    });

    /*
        Received by the client when a user connect or has a new status
        Has the following data:
        {
            id: 6,
            name: 'Zamiel',
            status 'Lobby',
        }
    */
    globals.conn.on('user', (data) => {
        globals.userList.set(data.id, data);
        lobbyUsersDraw();
    });

    /*
        Received by the client when a user disconnects
        Has the following data:
        {
            id: 6,
        }
    */
    globals.conn.on('userLeft', (data) => {
        globals.userList.delete(data.id);
        lobbyUsersDraw();
    });

    /*
        Received by the client when a table is created or modified
        Has the following data:
        {
            id: 6,
            name: 'test table',
            password: false,
            joined: false,
            numPlayers: 1,
            owned: false,
            running: false,
            variant: 'No Variant',
            timed: false,
            baseTime: 0,
            timePerTurn: 0,
            ourTurn: false,
            sharedReplay: false,
            progress: 0,
            players: 'Zamiel, DuneAught',
            spectators: 'Libster',
        }
    */
    globals.conn.on('table', (data) => {
        // The baseTime and timePerTurn come in seconds, so convert them to milliseconds
        data.baseTime *= 1000;
        data.timePerTurn *= 1000;

        globals.tableList.set(data.id, data);
        lobbyTablesDraw();
    });

    /*
        Received by the client when a table no longer has any members present
        Has the following data:
        {
            id: 6,
        }
    */
    globals.conn.on('tableGone', (data) => {
        globals.tableList.delete(data.id);
        lobbyTablesDraw();
    });


    /*
        Received by the client when a new chat message arrives
        Has the following data:
        {
            msg: 'poop',
            who: 'Zamiel',
            discord: false,
            server: false,
            datetime: 123456789,
            room: 'lobby',
        }
    */
    globals.conn.on('chat', (data) => {
        chat.add(data, false); // The second argument is "fast"

        if (!data.room.startsWith('table')) {
            return;
        }
        if (globals.currentScreen === 'pregame') {
            // Notify the server that we have read the chat message that was just received
            globals.conn.send('chatRead');
        } else if (globals.currentScreen === 'game' && globals.ui !== null) {
            if ($('#game-chat-modal').is(':visible')) {
                // Notify the server that we have read the chat message that was just received
                globals.conn.send('chatRead');
            } else if (
                globals.ui.globals.spectating
                && !globals.ui.globals.sharedReplay
                && !$('#game-chat-modal').is(':visible')
            ) {
                // The chat window was not open; pop open the chat window every time for spectators
                gameChat.toggle();
                globals.conn.send('chatRead');
            } else {
                // The chat window was not open; by default, keep it closed
                // Change the "Chat" button to say "Chat (1)"
                // (or e.g. "Chat (3)", if they have multiple unread messages)
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
        globals.tableID = data.tableID;

        // We joined a new game, so transition between screens
        lobbyTablesDraw();
        lobbyPregame.show();
    });

    globals.conn.on('left', () => {
        // We left a table, so transition between screens
        lobbyTablesDraw();
        lobbyPregame.hide();
    });

    globals.conn.on('game', (data) => {
        globals.game = data;

        // The baseTime and timePerTurn come in seconds, so convert them to milliseconds
        globals.game.baseTime *= 1000;
        globals.game.timePerTurn *= 1000;

        lobbyPregame.draw();
    });

    globals.conn.on('tableReady', (data) => {
        if (data.ready) {
            $('#nav-buttons-pregame-start').removeClass('disabled');
        } else {
            $('#nav-buttons-pregame-start').addClass('disabled');
        }
    });

    globals.conn.on('tableStart', (data) => {
        if (!data.replay) {
            lobbyPregame.hide();
        }
        gameMain.show(data.replay);
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
            lobbyHistory.draw();
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
        lobbyHistory.drawDetails();
    });

    globals.conn.on('sound', (data) => {
        if (globals.currentScreen === 'game' && globals.settings.sendTurnSound) {
            gameSounds.play(data.file);
        }
    });

    globals.conn.on('name', (data) => {
        globals.randomName = data.name;
    });

    globals.conn.on('warning', (data) => {
        console.warn(data.warning);
        modals.warningShow(data.warning);
        if (
            globals.currentScreen === 'game'
            && globals.ui !== null
            && globals.ui.globals.ourTurn
        ) {
            globals.ui.reshowClueUIAfterWarning();
        }
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
    gameWebsocketInit();
};
