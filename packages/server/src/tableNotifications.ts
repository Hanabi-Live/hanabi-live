import { PROJECT_NAME, ServerCommand, Status } from "@hanabi-live/data";
import { isValidPlayerIndex } from "@hanabi-live/game";
import { escapeHTMLCharacters } from "complete-common";
import { chatMessageToWire } from "./chatMessage";
import { clearTyping, getTypingState } from "./chatPresence";
import type { Table } from "./interfaces/Table";
import type { TablePlayer } from "./interfaces/TablePlayer";
import { cancelPregameStart } from "./pregameStart";
import { getTableAudience, getTableData, removeTable } from "./tables";
import { wsSend, wsSendAll } from "./wsHelpers";
import type { WSUser } from "./wsUsers";
import { getUserData, wsUsers } from "./wsUsers";

export function notifyTable(table: Table): void {
  if (!table.visible) {
    return;
  }
  for (const user of wsUsers.values()) {
    wsSend(
      user.connection,
      ServerCommand.table,
      getTableData(table, user.userID),
    );
  }
}

export function notifyPregame(table: Table, initialUser?: WSUser): void {
  const audience = new Set(getTableAudience(table));
  if (
    initialUser !== undefined
    && wsUsers.get(initialUser.userID) === initialUser
    && (table.players.some((player) => player.userID === initialUser.userID)
      || table.spectators.some(
        (spectator) => spectator.userID === initialUser.userID,
      ))
  ) {
    audience.add(initialUser);
  }
  for (const user of audience) {
    sendPregame(table, user);
  }
}

function sendPregame(table: Table, user: WSUser) {
  wsSend(user.connection, ServerCommand.game, {
    tableID: table.id,
    name: table.name,
    owner: table.ownerID,
    players: table.players.map((player, index) => ({
      index,
      name: player.name,
      you: player.userID === user.userID,
      present: player.present,
      stats: player.stats,
    })),
    options: table.options,
    passwordProtected: table.passwordHash !== undefined,
    maxPlayers: table.maxPlayers,
  });
}

export function tableNotice(table: Table, text: string): void {
  const message = chatMessageToWire({
    kind: "notice",
    source: "server",
    who: PROJECT_NAME,
    text,
    datetime: new Date().toISOString(),
    room: `table${table.id}`,
  });
  table.chat.push({ userID: 0, message });
  for (const user of getTableAudience(table)) {
    wsSend(user.connection, ServerCommand.chat, message);
  }
}

export function notifyJoined(
  table: Table,
  user: WSUser,
  spectating = false,
): void {
  const wsUser = user;
  wsUser.status = spectating ? Status.Spectating : Status.PreGame;
  wsUser.tableID = table.id;
  wsSendAll(ServerCommand.user, getUserData(wsUser));
  wsSend(user.connection, ServerCommand.joined, { tableID: table.id });
  wsSend(user.connection, ServerCommand.chatList, {
    list: table.chat.slice(-1000).map((entry) => entry.message),
    unread: table.chat.length - (table.chatRead.get(user.userID) ?? 0),
  });
  table.chatRead.set(user.userID, table.chat.length);
  wsSend(user.connection, ServerCommand.spectators, {
    tableID: table.id,
    spectators: table.spectators.map((spectator) => ({
      name: spectator.name,
      shadowingPlayerIndex: spectator.shadowingPlayerIndex,
      shadowingPlayerUsername: spectator.shadowingPlayerUsername,
    })),
  });
  for (const state of getTypingState(table, user)) {
    wsSend(user.connection, ServerCommand.chatTyping, state);
  }
}

export function leaveTable(table: Table, player: TablePlayer): void {
  cancelPregameCountdown(table);
  clearTyping(table, player.userID);
  const currentTable = table;
  const previous = table.players;
  currentTable.players = table.players.filter((entry) => entry !== player);
  refreshPregameSpectators(table, previous);
  currentTable.chatRead.delete(player.userID);
  const user = wsUsers.get(player.userID);
  if (user?.tableID === table.id) {
    user.status = Status.Lobby;
    user.tableID = 0 as typeof table.id;
    wsSendAll(ServerCommand.user, getUserData(user));
    wsSend(user.connection, ServerCommand.left, { tableID: table.id });
  }
  tableNotice(table, `${escapeHTMLCharacters(player.name)} left the game.`);
  const newOwner = table.players[0];
  if (player.userID === table.ownerID && newOwner !== undefined) {
    currentTable.ownerID = newOwner.userID;
    tableNotice(
      table,
      `${escapeHTMLCharacters(newOwner.name)} is the new table owner.`,
    );
  }
  notifyPregame(table);
  notifyTable(table);
  removeEmptyPregameTable(table);
}

export function cancelPregameCountdown(table: Table): void {
  const planned = table.datetimePlannedStart !== undefined;
  cancelPregameStart(table);
  if (planned) {
    tableNotice(table, "Automatic game start has been canceled.");
  }
}

export function refreshPregameSpectators(
  table: Table,
  previousPlayers: readonly TablePlayer[],
): void {
  const current = table;
  current.spectators = table.spectators.map((spectator) => {
    const previousIndex = spectator.shadowingPlayerIndex;
    const shadowID =
      previousIndex === undefined || previousIndex === -1
        ? undefined
        : previousPlayers[previousIndex]?.userID;
    const index = table.players.findIndex(
      (player) => player.userID === shadowID,
    );
    return {
      ...spectator,
      shadowingPlayerIndex: isValidPlayerIndex(index) ? index : undefined,
      shadowingPlayerUsername: isValidPlayerIndex(index)
        ? table.players[index]?.name
        : undefined,
      shadowingPlayerPregameIndex: isValidPlayerIndex(index)
        ? index
        : undefined,
    };
  });
}

export function removeEmptyPregameTable(table: Table): void {
  if (table.players.length === 0 && !table.running && !table.replay) {
    for (const spectator of table.spectators) {
      clearTyping(table, spectator.userID);
      const user = wsUsers.get(spectator.userID);
      if (user?.tableID === table.id) {
        user.status = Status.Lobby;
        user.tableID = 0 as typeof table.id;
        wsSendAll(ServerCommand.user, getUserData(user));
        wsSend(user.connection, ServerCommand.left, { tableID: table.id });
      }
    }
    removeTable(table.id);
    if (table.visible) {
      wsSendAll(ServerCommand.tableGone, { tableID: table.id });
    }
  }
}
