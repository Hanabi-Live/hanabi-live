import { PROJECT_NAME, ServerCommand, Status } from "@hanabi-live/data";
import { chatMessageToWire } from "./chatMessage";
import type { Table } from "./interfaces/Table";
import type { TablePlayer } from "./interfaces/TablePlayer";
import { getTableData, removeTable } from "./tables";
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

export function notifyPregame(table: Table): void {
  for (const player of table.players) {
    const user = wsUsers.get(player.userID);
    if (user !== undefined && player.present) {
      sendPregame(table, user);
    }
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
  for (const player of table.players) {
    const user = wsUsers.get(player.userID);
    if (user !== undefined && player.present) {
      wsSend(user.connection, ServerCommand.chat, message);
    }
  }
}

export function notifyJoined(table: Table, user: WSUser): void {
  const wsUser = user;
  wsUser.status = Status.PreGame;
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
    spectators: [],
  });
}

export function leaveTable(table: Table, player: TablePlayer): void {
  const currentTable = table;
  currentTable.players = table.players.filter((entry) => entry !== player);
  currentTable.chatRead.delete(player.userID);
  const user = wsUsers.get(player.userID);
  if (user !== undefined) {
    user.status = Status.Lobby;
    user.tableID = 0 as typeof table.id;
    wsSendAll(ServerCommand.user, getUserData(user));
    wsSend(user.connection, ServerCommand.left, { tableID: table.id });
  }
  tableNotice(table, `${player.name} left the game.`);
  const newOwner = table.players[0];
  if (player.userID === table.ownerID && newOwner !== undefined) {
    currentTable.ownerID = newOwner.userID;
    tableNotice(table, `${newOwner.name} is the new table owner.`);
  }
  notifyPregame(table);
  notifyTable(table);
  if (table.players.length === 0) {
    removeTable(table.id);
    if (table.visible) {
      wsSendAll(ServerCommand.tableGone, { tableID: table.id });
    }
  }
}
