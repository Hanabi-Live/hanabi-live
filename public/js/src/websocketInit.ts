/*
    Communication with the server is done through the WebSocket protocol
    The client uses a slightly modified version of the Golem WebSocket library
*/

// Imports
import * as chat from './chat';
import ChatMessage from './ChatMessage';
import Connection from './Connection';
import * as gameChat from './game/chat';
import gameWebsocketInit from './game/websocketInit';
import globals from './globals';
import * as lobbyLoginMisc from './lobby/loginMisc';
import * as lobbySettings from './lobby/settings';
import lobbyWebsocketInit from './lobby/websocketInit';
import * as modals from './modals';

export default () => {
    // Ensure that we are connecting to the right URL
    const domain = $('#domain').html();
    if (window.location.hostname !== domain) {
        modals.errorShow(`You are supposed to connect to Hanabi Live using the URL of: ${domain}`);
    }

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
    globals.conn.on('socketError', (event: Event) => {
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

    globals.conn.send = (command: string, data: any) => {
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
    // Received by the client upon first connecting
    interface HelloData {
        username: string,
        totalGames: number,
        firstTimeUser: boolean,
        settings: any,
        version: number,
        shuttingDown: boolean,
    }
    globals.conn.on('hello', (data: HelloData) => {
        // Store variables relating to our user account
        globals.username = data.username; // We might have logged-in with a different stylization
        globals.totalGames = data.totalGames;

        // Convert the settings object to a Map
        for (const [setting, value] of Object.entries(data.settings)) {
            // Some settings are stored on the server as numbers,
            // but we need them as strings because they will exist in an input field
            const settingsToConvertToStrings = [
                'createTableBaseTimeMinutes',
                'createTableTimePerTurnSeconds',
            ];
            let newValue = value;
            if (typeof newValue === 'number' && setting in settingsToConvertToStrings) {
                newValue = newValue.toString();
            }

            if (
                typeof newValue !== 'string'
                && typeof newValue !== 'number'
                && typeof newValue !== 'boolean'
            ) {
                throw new Error(`The settings of "${newValue}" was an unknown type.`);
            }

            globals.settings.set(setting, newValue);
        }

        // Update various elements of the UI to reflect our settings
        $('#nav-buttons-history-total-games').html(globals.totalGames.toString());
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
            let gameIDString = '';
            const match = window.location.pathname.match(/\/replay\/(\d+)/);
            if (match) {
                gameIDString = match[1];
            } else if (window.location.pathname === '/dev2') {
                gameIDString = '51'; // The first game in the Hanabi Live database
            }
            if (gameIDString !== '') {
                setTimeout(() => {
                    // The server expects the game ID as an integer
                    const gameID = parseInt(gameIDString, 10);
                    globals.conn.send('replayCreate', {
                        gameID,
                        source: 'id',
                        visibility: 'solo',
                    });
                }, 10);
            }
        }
    });

    // Received by the client when a new chat message arrives
    globals.conn.on('chat', (data: ChatMessage) => {
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
    interface ChatListData {
        list: Array<ChatMessage>,
        unread: number,
    }
    globals.conn.on('chatList', (data: ChatListData) => {
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

    interface WarningData {
        warning: string,
    }
    globals.conn.on('warning', (data: WarningData) => {
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

    interface ErrorData {
        error: string,
    }
    globals.conn.on('error', (data: ErrorData) => {
        console.error(data.error);
        modals.errorShow(data.error);

        // Disconnect from the server, if connected
        if (!globals.conn) {
            globals.conn.close();
        }
    });

    // Activate the command handlers for lobby-related commands
    lobbyWebsocketInit();

    // Activate the command handlers for game-related commands
    // (these will only have an effect if the current screen is equal to "game")
    gameWebsocketInit();
};
