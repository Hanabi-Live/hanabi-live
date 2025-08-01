// We will receive WebSocket messages / commands from the server that tell us to do things.

import type {
  ServerCommandChatData,
  ServerCommandErrorData,
  ServerCommandWarningData,
} from "@hanabi-live/data";
import { globals } from "./Globals";
import * as chat from "./chat";
import * as gameChat from "./game/chat";
import * as pregame from "./lobby/pregame";
import { Screen } from "./lobby/types/Screen";
import * as modals from "./modals";

// Define a command handler map.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CommandCallback = (data: any) => void;
export const commands = new Map<string, CommandCallback>();

commands.set("warning", (data: ServerCommandWarningData) => {
  console.warn(data.warning);
  modals.closeModals(true);
  setTimeout(() => {
    modals.showWarning(data.warning);
    // Re-activate some lobby elements.
    $("#nav-buttons-lobby-create-game").removeClass("disabled");
    if (globals.currentScreen === Screen.PreGame) {
      pregame.toggleStartGameButton();
      pregame.toggleJoinSpectateButtons();
    }
  }, 100);
});

commands.set("error", (data: ServerCommandErrorData) => {
  console.error(data.error);
  modals.showError(data.error);

  // Disconnect from the server, if connected.
  if (globals.conn !== null) {
    // This is safe to call if the WebSocket connection is already closed.
    globals.conn.close();
  }
});

// Received by the client when a new chat message arrives.
commands.set("chat", (data: ServerCommandChatData) => {
  chat.add(data, false); // The second argument is "fast".
  acknowledgeChatRead(data.room, data.recipient);
});

function acknowledgeChatRead(
  room: string | undefined,
  recipient: string | undefined,
) {
  const isPM = recipient !== undefined && recipient !== "";
  const isTableRoom = room !== undefined && room.startsWith("table");
  const isLobbyChat = !isPM && !isTableRoom;
  if (isLobbyChat) {
    return;
  }

  if (globals.currentScreen === Screen.PreGame) {
    // Notify the server that we have read the chat message that was just received.
    globals.conn!.send("chatRead", {
      tableID: globals.tableID,
    });
  } else if (globals.currentScreen === Screen.Game && globals.ui !== null) {
    if ($("#game-chat-modal").is(":visible")) {
      // The chat window was open; notify the server that we have read the chat message that was
      // just received.
      globals.conn!.send("chatRead", {
        tableID: globals.tableID,
      });
      return;
    }

    if (globals.ui.globals.store === null) {
      return;
    }

    const UIState = globals.ui.globals.state;
    if (!UIState.playing && !UIState.finished) {
      // The chat window was not open; pop open the chat window every time for spectators.
      gameChat.toggle();
      globals.conn!.send("chatRead", {
        tableID: globals.tableID,
      });
    } else {
      // The chat window was not open; by default, keep it closed. Change the "Chat" button to say
      // "Chat (1)" (or e.g. "Chat (2)", if they have multiple unread messages).
      globals.chatUnread++;
      globals.ui.updateChatLabel();
    }
  }
}

// Received by the client when someone either starts or stops typing.
interface ChatTypingMessage {
  name: string;
  typing: boolean;
}
commands.set("chatTyping", (data: ChatTypingMessage) => {
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

// The "chatList" command is sent upon initial connection to give the client a list of past lobby
// chat messages. It is also sent upon connecting to a game to give a list of past in-game chat
// messages.
interface ChatListData {
  list: ServerCommandChatData[];
  unread: number;
}
commands.set("chatList", (data: ChatListData) => {
  for (const line of data.list) {
    chat.add(line, true); // The second argument is "fast"
  }
  if (globals.ui !== null && !$("#game-chat-modal").is(":visible")) {
    // If the UI is open, we assume that this is a list of in-game chat messages.
    globals.chatUnread += data.unread;
    globals.ui.updateChatLabel();
  }
});
