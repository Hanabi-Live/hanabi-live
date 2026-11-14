// We will receive WebSocket messages / commands from the server that tell us to do things.

import * as chat from "./chat.ts";
import { chatRecipient } from "./chatKind.ts";
import * as gameChat from "./game/chat.ts";
import { gameChatUnreadChanged } from "./game/gameChatSlice.ts";
import * as gameSession from "./game/gameSession.ts";
import { globals } from "./Globals.ts";
import { typingStarted, typingStopped } from "./lobby/pregame/pregameSlice.ts";
import { Screen } from "./lobby/types/Screen.ts";
import * as modals from "./modals.ts";
import { noticeHtml } from "./notice.ts";
import { ServerHandlers } from "./serverHandlers.ts";
import { store } from "./store.ts";

// Define a command handler map.
export const commands = new ServerHandlers();

commands.set("warning", (data) => {
  console.warn(data.message);
  modals.showWarning(noticeHtml(data));
});

commands.set("error", (data) => {
  console.error(data.message);
  modals.showError(noticeHtml(data));

  // Disconnect from the server, if connected.
  if (globals.conn !== undefined) {
    // This is safe to call if the WebSocket connection is already closed.
    globals.conn.close();
  }
});

// Received by the client when a new chat message arrives.
commands.set("chat", (data) => {
  chat.add(data, false); // The second argument is "fast".
  acknowledgeChatRead(data.tableId, chatRecipient(data));
});

// Received by a table's owner when the server suggests settings for the table.
commands.set("tableSettingsSuggestion", (data) => {
  chat.addSettingsSuggestion(data, false);
});

commands.set("chatDeleted", (data) => {
  chat.removeDeletedLobbyMessage(data.chatId);
});

function acknowledgeChatRead(
  tableId: number | undefined,
  recipient: string | undefined,
) {
  const isPm = recipient !== undefined;
  const isTableRoom = tableId !== undefined;
  const isLobbyChat = !isPm && !isTableRoom;
  if (isLobbyChat) {
    return;
  }

  if (store.getState().session.screen === Screen.PreGame) {
    // Notify the server that we have read the chat message that was just received.
    globals.connection.send("chatRead", {
      tableId: globals.joinedTableId,
    });
  } else if (
    store.getState().session.screen === Screen.Game
    && gameSession.isOpen()
  ) {
    if (gameChat.isOpen()) {
      // The chat window was open; notify the server that we have read the chat message that was
      // just received.
      globals.connection.send("chatRead", {
        tableId: globals.joinedTableId,
      });
      return;
    }

    const state = store.getState().game.current;
    if (state === undefined) {
      return;
    }

    if (state.playing || state.finished) {
      // The chat window was not open; by default, keep it closed. Change the "Chat" button to say
      // "Chat (1)" (or e.g. "Chat (2)", if they have multiple unread messages).
      store.dispatch(
        gameChatUnreadChanged(store.getState().gameChat.unread + 1),
      );
      globals.ui?.updateChatLabel();
    } else {
      // The chat window was not open; pop open the chat window every time for spectators.
      gameChat.toggle(false);
      globals.connection.send("chatRead", {
        tableId: globals.joinedTableId,
      });
    }
  }
}

// Received by the client when someone either starts or stops typing.
commands.set("chatTyping", (data) => {
  store.dispatch(
    data.typing ? typingStarted(data.username) : typingStopped(data.username),
  );
});

// The "chatList" command is sent upon initial connection to give the client a list of past lobby
// chat messages. It is also sent upon connecting to a game to give a list of past in-game chat
// messages, with the table's ID and the number of unread messages.
commands.set("chatList", (data) => {
  const { table } = data;
  for (const line of data.messages) {
    // The list names its table once, not in each message.
    const message =
      table === undefined ? line : { ...line, tableId: table.tableId };
    chat.add(message, true); // The second argument is "fast"
  }
  if (table !== undefined && gameSession.isOpen() && !gameChat.isOpen()) {
    store.dispatch(
      gameChatUnreadChanged(store.getState().gameChat.unread + table.numUnread),
    );
    globals.ui?.updateChatLabel();
  }
});
