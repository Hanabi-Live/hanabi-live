// Communication with the server is done through the WebSocket protocol
// The client uses a slightly modified version of the Golem WebSocket library

import * as chat from './chat';
import ChatMessage from './ChatMessage';
import Connection from './Connection';
import * as gameChat from './game/chat';
import { DEFAULT_VARIANT_NAME } from './game/types/constants';
import gameWebsocketInit from './game/websocketInit';
import globals from './globals';
import * as lobbyLogin from './lobby/login';
import * as pregame from './lobby/pregame';
import Settings from './lobby/Settings';
import * as lobbySettingsTooltip from './lobby/settingsTooltip';
import lobbyWebsocketInit from './lobby/websocketInit';
import * as modals from './modals';
import * as sentry from './sentry';

export default function websocketInit() {
  // Ensure that we are connecting to the right URL
  const domain = $('#domain').html();
  if (window.location.hostname !== domain) {
    modals.errorShow(`You are supposed to connect to Hanabi Live using the URL of: ${domain}`);
    return;
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
    // We will show the lobby upon receiving the "welcome" command from the server
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
  });

  // All of the normal commands/messages that we expect from the server are defined in the
  // "initCommands()" function
  initCommands();
}

// This is all of the normal commands/messages that we expect to receive from the server
const initCommands = () => {
  if (globals.conn === null) {
    throw new Error('The "initCommands()" function was entered before "globals.conn" was initiated.');
  }

  // Received by the client upon first connecting
  interface WelcomeData {
    id: number;
    username: string;
    totalGames: number;
    muted: boolean;
    firstTimeUser: boolean;
    settings: any;
    friends: string[];
    atOngoingTable: boolean;
    shuttingDown: boolean;
    maintenanceMode: boolean;
  }
  globals.conn.on('welcome', (data: WelcomeData) => {
    // Store some variables (mostly relating to our user account)
    globals.id = data.id;
    globals.username = data.username; // We might have logged-in with a different stylization
    globals.totalGames = data.totalGames;
    globals.muted = data.muted;
    globals.settings = data.settings as Settings;
    globals.friends = data.friends;
    globals.shuttingDown = data.shuttingDown;
    globals.maintenanceMode = data.maintenanceMode;

    // Now that we know what our user ID and username are, we can attach them to the Sentry context
    sentry.setUserContext(globals.id, globals.username);

    // Update various elements of the UI to reflect our settings
    $('#nav-buttons-history-total-games').html(globals.totalGames.toString());
    lobbySettingsTooltip.setSettingsTooltip();
    lobbyLogin.hide(data.firstTimeUser);

    // Disable custom path functionality for first time users
    if (data.firstTimeUser) {
      return;
    }

    // If we are currently in an ongoing game or are reconnecting to a shared replay,
    // then do not automatically go into another replay
    if (data.atOngoingTable) {
      return;
    }

    // Automatically go into a replay if we are using a "/replay/123" URL
    const match1 = window.location.pathname.match(/\/replay\/(\d+)/);
    if (match1) {
      setTimeout(() => {
        const gameID = parseInt(match1[1], 10); // The server expects the game ID as an integer
        globals.conn!.send('replayCreate', {
          gameID,
          source: 'id',
          visibility: 'solo',
        });
      }, 10);
      return;
    }

    // Automatically go into a shared replay if we are using a "/shared-replay/123" URL
    const match2 = window.location.pathname.match(/\/shared-replay\/(\d+)/);
    if (match2) {
      setTimeout(() => {
        const gameID = parseInt(match2[1], 10); // The server expects the game ID as an integer
        globals.conn!.send('replayCreate', {
          gameID,
          source: 'id',
          visibility: 'shared',
        });
      }, 10);
    }

    // Automatically create a table if we are using a "/create-table" URL
    if (
      window.location.pathname === '/create-table'
      || window.location.pathname === '/dev/create-table'
    ) {
      const urlParams = new URLSearchParams(window.location.search);
      const name = urlParams.get('name') || globals.randomName;
      const variantName = urlParams.get('variantName') || DEFAULT_VARIANT_NAME;
      const timed = urlParams.get('timed') === 'true';
      const timeBaseString = urlParams.get('timeBase') || '120';
      const timeBase = parseInt(timeBaseString, 10);
      const timePerTurnString = urlParams.get('timePerTurn') || '20';
      const timePerTurn = parseInt(timePerTurnString, 10);
      const speedrun = urlParams.get('speedrun') === 'true';
      const cardCycle = urlParams.get('cardCycle') === 'true';
      const deckPlays = urlParams.get('deckPlays') === 'true';
      const emptyClues = urlParams.get('emptyClues') === 'true';
      const oneExtraCard = urlParams.get('oneExtraCard') === 'true';
      const oneLessCard = urlParams.get('oneLessCard') === 'true';
      const allOrNothing = urlParams.get('allOrNothing') === 'true';
      const detrimentalCharacters = urlParams.get('detrimentalCharacters') === 'true';
      const password = urlParams.get('password') || '';

      setTimeout(() => {
        globals.conn!.send('tableCreate', {
          name,
          options: {
            variantName,
            timed,
            timeBase,
            timePerTurn,
            speedrun,
            cardCycle,
            deckPlays,
            emptyClues,
            oneExtraCard,
            oneLessCard,
            allOrNothing,
            detrimentalCharacters,
          },
          password,
        });
      }, 10);
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
      globals.conn!.send('chatRead', {
        tableID: globals.tableID,
      });
    } else if (globals.currentScreen === 'game' && globals.ui !== null) {
      if ($('#game-chat-modal').is(':visible')) {
        // Notify the server that we have read the chat message that was just received
        globals.conn!.send('chatRead', {
          tableID: globals.tableID,
        });
      } else if (
        globals.ui.globals.spectating
        && !globals.ui.globals.sharedReplay
        && !$('#game-chat-modal').is(':visible')
      ) {
        // The chat window was not open; pop open the chat window every time for spectators
        gameChat.toggle();
        globals.conn!.send('chatRead', {
          tableID: globals.tableID,
        });
      } else {
        // The chat window was not open; by default, keep it closed
        // Change the "Chat" button to say "Chat (1)"
        // (or e.g. "Chat (3)", if they have multiple unread messages)
        globals.chatUnread += 1;
        globals.ui.updateChatLabel();
      }
    }
  });

  // Received by the client when someone either starts or stops typing
  interface ChatTypingMessage {
    name: string;
    typing: boolean;
  }
  globals.conn.on('chatTyping', (data: ChatTypingMessage) => {
    if (data.typing) {
      if (!globals.peopleTyping.includes(data.name)) {
        globals.peopleTyping.push(data.name);
      }
    } else {
      const index = globals.peopleTyping.indexOf(data.name);
      if (index !== -1) {
        globals.peopleTyping.splice(index, 1);
      }
    }
    chat.updatePeopleTyping();
  });

  // The "chatList" command is sent upon initial connection
  // to give the client a list of past lobby chat messages
  // It is also sent upon connecting to a game to give a list of past in-game chat messages
  interface ChatListData {
    list: ChatMessage[];
    unread: number;
  }
  globals.conn.on('chatList', (data: ChatListData) => {
    for (const line of data.list) {
      chat.add(line, true); // The second argument is "fast"
    }
    if (
      globals.ui !== null
      && !$('#game-chat-modal').is(':visible')
    ) {
      // If the UI is open, we assume that this is a list of in-game chat messages
      globals.chatUnread += data.unread;
      globals.ui.updateChatLabel();
    }
  });

  interface ShutdownData {
    shuttingDown: boolean;
    datetimeShutdownInit: number;
  }
  globals.conn.on('shutdown', (data: ShutdownData) => {
    globals.shuttingDown = data.shuttingDown;
    globals.datetimeShutdownInit = data.datetimeShutdownInit;
  });

  interface MaintenanceData {
    maintenanceMode: boolean;
  }
  globals.conn.on('maintenance', (data: MaintenanceData) => {
    globals.maintenanceMode = data.maintenanceMode;
  });

  interface WarningData {
    warning: string;
  }
  globals.conn.on('warning', (data: WarningData) => {
    console.warn(data.warning);
    modals.warningShow(data.warning);

    // Re-activate some lobby elements
    $('#nav-buttons-games-create-game').removeClass('disabled');
    if (globals.currentScreen === 'pregame') {
      pregame.enableStartGameButton();
    }

    // Re-activate in-game elements
    if (
      globals.currentScreen === 'game'
      && globals.ui !== null
      && globals.ui.globals.ourTurn
    ) {
      globals.ui.reshowClueUIAfterWarning();
    }
  });

  interface ErrorData {
    error: string;
  }
  globals.conn.on('error', (data: ErrorData) => {
    console.error(data.error);
    modals.errorShow(data.error);

    // Disconnect from the server, if connected
    if (globals.conn !== null) {
      // This is safe to call if the WebSocket connection is already closed
      globals.conn.close();
    }
  });

  // Activate the command handlers for lobby-related commands
  lobbyWebsocketInit();

  // Activate the command handlers for game-related commands
  // (these will only have an effect if the current screen is equal to "game")
  gameWebsocketInit();
};
