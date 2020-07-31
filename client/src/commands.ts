// We will receive WebSocket messages / commands from the server that tell us to do things

import * as chat from './chat';
import * as gameChat from './game/chat';
import globals from './globals';
import * as pregame from './lobby/pregame';
import Screen from './lobby/types/Screen';
import * as modals from './modals';
import ChatMessage from './types/ChatMessage';

// Define a command handler map
type CommandCallback = (data: any) => void;
const commands = new Map<string, CommandCallback>();
export default commands;

interface WarningData {
  warning: string;
}
commands.set('warning', (data: WarningData) => {
  console.warn(data.warning);
  modals.warningShow(data.warning);

  // Re-activate some lobby elements
  $('#nav-buttons-games-create-game').removeClass('disabled');
  if (globals.currentScreen === Screen.PreGame) {
    pregame.enableStartGameButton();
  }

  // Re-activate in-game elements
  if (
    globals.currentScreen === Screen.Game
    && globals.ui !== null
  ) {
    globals.ui.reshowClueUIAfterWarning();
  }
});

interface ErrorData {
  error: string;
}
commands.set('error', (data: ErrorData) => {
  console.error(data.error);
  modals.errorShow(data.error);

  // Disconnect from the server, if connected
  if (globals.conn !== null) {
    // This is safe to call if the WebSocket connection is already closed
    globals.conn.close();
  }
});

// Received by the client when a new chat message arrives
commands.set('chat', (data: ChatMessage) => {
  chat.add(data, false); // The second argument is "fast"

  if (!data.room.startsWith('table')) {
    return;
  }
  if (globals.currentScreen === Screen.PreGame) {
    // Notify the server that we have read the chat message that was just received
    globals.conn!.send('chatRead', {
      tableID: globals.tableID,
    });
  } else if (globals.currentScreen === Screen.Game && globals.ui !== null) {
    if ($('#game-chat-modal').is(':visible')) {
      // The chat window was open;
      // notify the server that we have read the chat message that was just received
      globals.conn!.send('chatRead', {
        tableID: globals.tableID,
      });
      return;
    }

    if (globals.ui.globals.store === null) {
      return;
    }

    const state = globals.ui.globals.store.getState();
    if (!state.metadata.playing && !state.metadata.finished) {
      // The chat window was not open; pop open the chat window every time for spectators
      gameChat.toggle();
      globals.conn!.send('chatRead', {
        tableID: globals.tableID,
      });
    } else {
      // The chat window was not open; by default, keep it closed
      // Change the "Chat" button to say "Chat (1)"
      // (or e.g. "Chat (2)", if they have multiple unread messages)
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
commands.set('chatTyping', (data: ChatTypingMessage) => {
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
commands.set('chatList', (data: ChatListData) => {
  for (const line of data.list) {
    chat.add(line, true); // The second argument is "fast"
  }
  if (globals.ui !== null && !$('#game-chat-modal').is(':visible')) {
    // If the UI is open, we assume that this is a list of in-game chat messages
    globals.chatUnread += data.unread;
    globals.ui.updateChatLabel();
  }
});
