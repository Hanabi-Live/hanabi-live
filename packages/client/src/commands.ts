// We will receive WebSocket messages / commands from the server that tell us to do things.

import { globals } from "./Globals";
import * as chat from "./chat";
import * as gameChat from "./game/chat";
import * as pregame from "./lobby/pregame/pregame";
import { typingStarted, typingStopped } from "./lobby/pregame/pregameSlice";
import { Screen } from "./lobby/types/Screen";
import * as modals from "./modals";
import { ServerHandlers } from "./serverHandlers";
import { store } from "./store";

// Define a command handler map.
export const commands = new ServerHandlers();

commands.set("warning", (data) => {
  console.warn(data.message);
  globals.ui?.cancelPendingRestart();
  modals.closeModals(true);
  setTimeout(() => {
    modals.showWarning(data.message);
    // Re-activate some lobby elements.
    $("#nav-buttons-lobby-create-game").removeClass("disabled");
    if (globals.currentScreen === Screen.PreGame) {
      pregame.toggleStartGameButton();
      pregame.toggleJoinSpectateButtons();
    }
  }, modals.MODAL_DELAY_MILLISECONDS);
});

commands.set("error", (data) => {
  console.error(data.message);
  modals.showError(data.message);

  // Disconnect from the server, if connected.
  if (globals.conn !== undefined) {
    // This is safe to call if the WebSocket connection is already closed.
    globals.conn.close();
  }
});

// Received by the client when a new chat message arrives.
commands.set("chat", (data) => {
  chat.add(data, false); // The second argument is "fast".
  acknowledgeChatRead(data.tableID, data.recipient);
});

commands.set("chatDelete", (data) => {
  chat.removeDeletedLobbyMessage(data.chatID);
});

commands.set("chatPMHistory", (data) => {
  const room = chat.tableRoom(data.tableID);

  if (data.messages.length === 0) {
    chat.sendSelfPMFromServer(
      "No private messages found.",
      room,
      chat.SelfChatMessageType.Info,
    );
    return;
  }

  for (const line of data.messages) {
    chat.addPMHistory(line, room);
  }
});

function acknowledgeChatRead(
  tableID: number | undefined,
  recipient: string | undefined,
) {
  const isPM = recipient !== undefined && recipient !== "";
  const isTableRoom = tableID !== undefined;
  const isLobbyChat = !isPM && !isTableRoom;
  if (isLobbyChat) {
    return;
  }

  if (globals.currentScreen === Screen.PreGame) {
    // Notify the server that we have read the chat message that was just received.
    globals.conn!.send("chatRead", {
      tableID: globals.tableID,
    });
  } else if (
    globals.currentScreen === Screen.Game
    && globals.ui !== undefined
  ) {
    if ($("#game-chat-modal").is(":visible")) {
      // The chat window was open; notify the server that we have read the chat message that was
      // just received.
      globals.conn!.send("chatRead", {
        tableID: globals.tableID,
      });
      return;
    }

    if (globals.ui.globals.store === undefined) {
      return;
    }

    const UIState = globals.ui.globals.state;
    if (UIState.playing || UIState.finished) {
      // The chat window was not open; by default, keep it closed. Change the "Chat" button to say
      // "Chat (1)" (or e.g. "Chat (2)", if they have multiple unread messages).
      globals.chatUnread++;
      globals.ui.updateChatLabel();
    } else {
      // The chat window was not open; pop open the chat window every time for spectators.
      gameChat.toggle(false);
      globals.conn!.send("chatRead", {
        tableID: globals.tableID,
      });
    }
  }
}

// Received by the client when someone either starts or stops typing.
commands.set("chatTyping", (data) => {
  store.dispatch(
    data.typing ? typingStarted(data.username) : typingStopped(data.username),
  );
  chat.updatePeopleTyping();
});

// The "chatList" command is sent upon initial connection to give the client a list of past lobby
// chat messages. It is also sent upon connecting to a game to give a list of past in-game chat
// messages.
commands.set("chatList", (data) => {
  for (const line of data.messages) {
    chat.add(line, true); // The second argument is "fast"
  }
  if (globals.ui !== undefined && !$("#game-chat-modal").is(":visible")) {
    // If the UI is open, we assume that this is a list of in-game chat messages.
    globals.chatUnread += data.unread;
    globals.ui.updateChatLabel();
  }
});
