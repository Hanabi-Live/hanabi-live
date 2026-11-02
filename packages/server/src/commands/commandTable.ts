import type { ClientCommandData, TableID, UserID } from "@hanabi-live/data";
import { PROJECT_NAME, ServerCommand } from "@hanabi-live/data";
import { doesVariantExist } from "@hanabi-live/game";
import * as argon2 from "argon2";
import { escapeHTMLCharacters } from "complete-common";
import { chatServerSendPM } from "../chat";
import { prepareCustomGame } from "../customGame";
import { ActionRejected } from "../engine/types";
import { getGameRuntime } from "../gameRuntime";
import type { Table } from "../interfaces/Table";
import type { TablePlayer } from "../interfaces/TablePlayer";
import { isMaintenanceMode } from "../maintenanceMode";
import type { PregameStartIntent } from "../pregameStart";
import { getPregameStats, getVariantStats } from "../pregameStats";
import { preparePregameStart, startPregame } from "../pregameTimers";
import { getShutdownControl } from "../shutdown";
import {
  cancelPregameCountdown,
  leaveTable,
  notifyJoined,
  notifyPregame,
  notifyTable,
  refreshPregameSpectators,
  tableNotice,
} from "../tableNotifications";
import { optionsSuggestion, prepareTableOptions } from "../tableOptions";
import { enqueueTableOperation, scheduleTableCleanup } from "../tableQueue";
import {
  allocateTableID,
  getTable,
  getTableIDsUserAttending,
  getTableIDsUserPlayingAt,
  publishTable,
} from "../tables";
import { normalizeString } from "../utils";
import { wsError, wsSend, wsSendAll, wsWarning } from "../wsHelpers";
import type { WSUser } from "../wsUsers";
import { wsUsers } from "../wsUsers";
import {
  commandRunningReattend,
  commandRunningSetLeader,
  commandRunningTerminate,
} from "./commandGame";

function isCurrent(user: WSUser) {
  return (
    wsUsers.get(user.userID) === user
    && user.connection.readyState === user.connection.OPEN
  );
}

function canJoinAnotherTable(user: WSUser) {
  if (
    !user.username.startsWith("Bot-")
    && getTableIDsUserPlayingAt(user.userID).length > 0
  ) {
    wsWarning(
      user.connection,
      "You cannot join more than one table at a time. Terminate your other game before joining a new one.",
    );
    return false;
  }
  return true;
}

async function preparePlayer(
  user: WSUser,
  variantName: string,
): Promise<TablePlayer> {
  const stats = await getPregameStats(user.userID, variantName);
  return {
    userID: user.userID,
    name: user.username,
    present: true,
    stats,
    typing: false,
    lastTyped: new Date(0),
    voteToKill: false,
  };
}

async function runOperation(
  user: WSUser,
  tableID: TableID,
  operation: () => void | Promise<void>,
) {
  const admitted = await enqueueTableOperation(tableID, async () => {
    if (isCurrent(user)) {
      await operation();
    }
  });
  if (!admitted && isCurrent(user)) {
    wsWarning(
      user.connection,
      "Too many pending table commands. Please try again.",
    );
  }
}

async function withPregame(
  user: WSUser,
  tableID: TableID,
  ownerOnly: boolean,
  operation: (table: Table) => void | Promise<void>,
) {
  await runOperation(user, tableID, async () => {
    const table = getTable(tableID);
    if (table === undefined) {
      wsWarning(user.connection, `Table ${tableID} does not exist.`);
    } else if (table.recoveryBlocked === true) {
      wsWarning(
        user.connection,
        "This table is frozen because its durable state is uncertain.",
      );
    } else if (table.running || table.replay) {
      wsWarning(
        user.connection,
        "This command is not available for running games or replays.",
      );
    } else if (ownerOnly && table.ownerID !== user.userID) {
      wsWarning(
        user.connection,
        "Only the table owner can perform this action.",
      );
    } else {
      await operation(table);
    }
  });
}

function creationAvailable(user: WSUser) {
  if (isMaintenanceMode()) {
    wsWarning(
      user.connection,
      "The server is undergoing maintenance. You cannot start any new games for the time being.",
    );
    return false;
  }
  if (getShutdownControl()?.isImminent() === true) {
    wsWarning(
      user.connection,
      "The server is about to shut down. You cannot create a new game.",
    );
    return false;
  }
  return true;
}

export async function commandTableCreate(
  user: WSUser,
  data: ClientCommandData["tableCreate"],
): Promise<void> {
  if (!creationAvailable(user)) {
    return;
  }
  const options = prepareTableOptions(user, data);
  if (options === undefined) {
    return;
  }
  let prepared: Awaited<ReturnType<typeof prepareCustomGame>>;
  try {
    prepared = await prepareCustomGame(options, data.gameJSON);
  } catch (error) {
    if (!(error instanceof ActionRejected)) {
      throw error;
    }
    wsWarning(user.connection, error.message);
    return;
  }
  const id = allocateTableID();
  await runOperation(user, id, async () => {
    if (!canJoinAnotherTable(user)) {
      return;
    }
    const player = await preparePlayer(user, prepared.options.variantName);
    const passwordHash =
      data.password === "" ? undefined : await argon2.hash(data.password);
    if (
      !isCurrent(user)
      || !canJoinAnotherTable(user)
      || !creationAvailable(user)
    ) {
      return;
    }
    const now = new Date();
    const table: Table = {
      id,
      name: prepared.name,
      initialName: prepared.name,
      players: [],
      maxPlayers: prepared.maxPlayers,
      spectators: [],
      kickedPlayers: [],
      ownerID: user.userID,
      visible: !data.hidePregame,
      passwordHash,
      running: false,
      replay: false,
      progress: 0,
      datetimeCreated: now,
      datetimeLastJoined: now,
      datetimePlannedStart: undefined,
      datetimeLastAction: now,
      game: undefined,
      options: prepared.options,
      extraOptions: prepared.extraOptions,
      chat: [],
      chatRead: new Map(),
    };
    // Nothing observable is published until every fallible preparation step has completed.
    tableNotice(
      table,
      `<strong>${escapeHTMLCharacters(user.username)}</strong> created the table.`,
    );
    table.players.push(player);
    publishTable(table);
    notifyTable(table);
    notifyPregame(table, user);
    notifyJoined(table, user);
  });
}

export async function commandTableJoin(
  user: WSUser,
  data: ClientCommandData["tableJoin"],
): Promise<void> {
  let intent: PregameStartIntent | undefined;
  await withPregame(user, data.tableID, false, async (table) => {
    if (table.players.some((player) => player.userID === user.userID)) {
      wsWarning(user.connection, "You have already joined this table.");
      return;
    }
    if (table.players.length >= table.maxPlayers) {
      wsWarning(user.connection, "That table is already full.");
      return;
    }
    if (table.kickedPlayers.includes(user.userID)) {
      wsWarning(
        user.connection,
        "You cannot join a game that you have been kicked from.",
      );
      return;
    }
    if (!canJoinAnotherTable(user)) {
      return;
    }
    if (
      table.passwordHash !== undefined
      && !(await argon2.verify(table.passwordHash, data.password))
    ) {
      wsWarning(
        user.connection,
        "That is not the correct password for this game.",
      );
      return;
    }
    const player = await preparePlayer(user, table.options.variantName);
    if (!isCurrent(user) || !canJoinAnotherTable(user)) {
      return;
    }
    const currentTable = table;
    currentTable.players.push(player);
    currentTable.datetimeLastJoined = new Date();
    notifyTable(table);
    notifyPregame(table, user);
    notifyJoined(table, user);
    tableNotice(
      table,
      `${escapeHTMLCharacters(user.username)} joined the game.`,
    );
    cancelPregameCountdown(table);
    if (table.automaticStart === table.players.length) {
      intent = preparePregameStart(table);
    }
  });
  await startPregame(intent);
}

export async function commandTableLeave(
  user: WSUser,
  data: ClientCommandData["tableLeave"],
): Promise<void> {
  await withPregame(user, data.tableID, false, (table) => {
    const player = table.players.find((entry) => entry.userID === user.userID);
    if (player === undefined) {
      wsWarning(
        user.connection,
        `You are not at table ${table.id}, so you cannot leave it.`,
      );
      return;
    }
    leaveTable(table, player);
  });
}

export async function commandTableReattend(
  user: WSUser,
  data: ClientCommandData["tableReattend"],
): Promise<void> {
  if (getTable(data.tableID)?.running === true) {
    await commandRunningReattend(user, data);
    return;
  }
  await withPregame(user, data.tableID, false, (table) => {
    const player = table.players.find((entry) => entry.userID === user.userID);
    if (player === undefined) {
      wsWarning(
        user.connection,
        `You are not playing at table ${table.id}, so you cannot reattend it.`,
      );
      return;
    }
    player.present = true;
    notifyPregame(table, user);
    notifyJoined(table, user);
  });
}

export async function commandTableTerminate(
  user: WSUser,
  data: ClientCommandData["tableTerminate"],
): Promise<void> {
  if (getTable(data.tableID)?.running === true) {
    await commandRunningTerminate(user, data);
    return;
  }
  await withPregame(user, data.tableID, false, (table) => {
    wsWarning(
      user.connection,
      table.players.some((player) => player.userID === user.userID)
        ? "You can not terminate a game that has not started yet."
        : `You are not playing at table ${table.id}, so you cannot terminate it.`,
    );
  });
}

export async function commandTableSetLeader(
  user: WSUser,
  data: ClientCommandData["tableSetLeader"],
): Promise<void> {
  if (getTable(data.tableID)?.running === true) {
    await commandRunningSetLeader(user, data);
    return;
  }
  await withPregame(user, data.tableID, false, (table) => {
    if (table.players.every((player) => player.userID !== user.userID)) {
      wsWarning(
        user.connection,
        "You must be at the table to change its leader.",
      );
      return;
    }
    if (data.name === "") {
      wsWarning(
        user.connection,
        'You must specify the username to pass the lead to. (e.g. "/setleader Alice")',
      );
      return;
    }
    const index = table.players.findIndex(
      (player) => normalizeString(player.name) === normalizeString(data.name),
    );
    const newLeader = table.players[index];
    if (newLeader === undefined) {
      wsError(
        user.connection,
        `"${escapeHTMLCharacters(data.name)}" is not joined to this table.`,
      );
      return;
    }
    if (newLeader.userID === table.ownerID) {
      wsWarning(user.connection, `${newLeader.name} is already the leader.`);
      return;
    }
    const currentTable = table;
    const previousPlayers = [...table.players];
    const first = table.players[0];
    if (first === undefined) {
      throw new Error("Cannot change the leader of an empty table.");
    }
    currentTable.players[0] = newLeader;
    currentTable.players[index] = first;
    currentTable.ownerID = newLeader.userID;
    refreshPregameSpectators(table, previousPlayers);
    cancelPregameCountdown(table);
    notifyPregame(table);
    notifyTable(table);
    tableNotice(
      table,
      `${escapeHTMLCharacters(user.username)} has passed table ownership to: ${escapeHTMLCharacters(newLeader.name)}`,
    );
  });
}

async function refreshStats(
  table: Table,
  variantName: string,
): Promise<ReadonlyMap<UserID, TablePlayer["stats"]["variant"]>> {
  const stats = new Map<UserID, TablePlayer["stats"]["variant"]>();
  for (const player of table.players) {
    // At most six queries; avoid a single table consuming the database connection pool.
    // eslint-disable-next-line no-await-in-loop
    stats.set(player.userID, await getVariantStats(player.userID, variantName));
  }
  return stats;
}

function applyStats(
  table: Table,
  stats: ReadonlyMap<UserID, TablePlayer["stats"]["variant"]>,
) {
  for (const player of table.players) {
    const variant = stats.get(player.userID);
    if (variant !== undefined) {
      player.stats = { ...player.stats, variant };
    }
  }
}

export async function commandTableSetVariant(
  user: WSUser,
  data: ClientCommandData["tableSetVariant"],
): Promise<void> {
  await withPregame(user, data.tableID, true, async (table) => {
    if (!doesVariantExist(data.options.variantName)) {
      wsWarning(
        user.connection,
        `"${escapeHTMLCharacters(data.options.variantName)}" is not a valid variant.`,
      );
      return;
    }
    const stats = await refreshStats(table, data.options.variantName);
    if (!isCurrent(user)) {
      return;
    }
    const currentTable = table;
    currentTable.options = {
      ...table.options,
      variantName: data.options.variantName,
    };
    cancelPregameCountdown(table);
    applyStats(table, stats);
    notifyPregame(table);
    notifyTable(table);
    tableNotice(
      table,
      `${escapeHTMLCharacters(user.username)} has changed the variant to: ${escapeHTMLCharacters(data.options.variantName)}`,
    );
  });
}

export async function commandTableUpdate(
  user: WSUser,
  data: ClientCommandData["tableUpdate"],
): Promise<void> {
  await withPregame(user, data.tableID, false, async (table) => {
    if (table.players.every((player) => player.userID !== user.userID)) {
      wsWarning(
        user.connection,
        "You must be at the table to propose or change its options.",
      );
      return;
    }
    const options = prepareTableOptions(
      user,
      data,
      table.ownerID === user.userID,
    );
    if (options === undefined) {
      return;
    }
    if (table.ownerID !== user.userID) {
      proposeOptions(user, table, options);
      return;
    }
    let prepared: Awaited<ReturnType<typeof prepareCustomGame>>;
    try {
      prepared = await prepareCustomGame(options, data.gameJSON);
    } catch (error) {
      if (!(error instanceof ActionRejected)) {
        throw error;
      }
      wsWarning(user.connection, error.message);
      return;
    }
    const stats = await refreshStats(table, prepared.options.variantName);
    if (!isCurrent(user)) {
      return;
    }
    const currentTable = table;
    cancelPregameCountdown(table);
    for (const player of table.players.slice(prepared.maxPlayers)) {
      leaveTable(table, player);
      const removed = wsUsers.get(player.userID);
      if (removed !== undefined) {
        chatServerSendPM(
          removed,
          "You have been removed from the table due to new max players restriction.",
          "lobby",
        );
      }
    }
    currentTable.name = prepared.name;
    if (table.visible && data.hidePregame) {
      wsSendAll(ServerCommand.tableGone, { tableID: table.id });
    }
    currentTable.visible = !data.hidePregame;
    currentTable.maxPlayers = prepared.maxPlayers;
    currentTable.options = prepared.options;
    currentTable.extraOptions = prepared.extraOptions;
    currentTable.initialName = prepared.name;
    applyStats(table, stats);
    notifyPregame(table);
    notifyTable(table);
    tableNotice(
      table,
      `${escapeHTMLCharacters(user.username)} has changed game options.`,
    );
  });
}

function proposeOptions(
  user: WSUser,
  table: Table,
  prepared: NonNullable<ReturnType<typeof prepareTableOptions>>,
) {
  const changes: string[] = [];
  if (prepared.name !== table.name) {
    changes.push(`Table Name: <b>${prepared.name}</b>`);
  }
  if (prepared.maxPlayers !== table.maxPlayers) {
    changes.push(`Max Players: <b>${prepared.maxPlayers}</b>`);
  }
  const labels = {
    variantName: "Variant",
    timed: "Timed",
    timeBase: "Base Time",
    timePerTurn: "Time per Turn",
    speedrun: "Speedrun",
    cardCycle: "Card Cycling",
    deckPlays: "Bottom-Deck",
    emptyClues: "Empty Clues",
    oneExtraCard: "One Extra Card",
    oneLessCard: "One Less Card",
    allOrNothing: "All or Nothing",
    detrimentalCharacters: "Detrimental Characters",
  } as const;
  for (const [key, label] of Object.entries(labels)) {
    const field = key as keyof typeof labels;
    const value = prepared.options[field];
    if (value !== table.options[field]) {
      changes.push(`${label}: <b>${escapeHTMLCharacters(String(value))}</b>`);
    }
  }
  if (changes.length === 0) {
    wsWarning(user.connection, "There are no new options proposed.");
    return;
  }
  const markup = changes
    .map((change) => `<span class="cp">${change}</span>`)
    .join("");
  tableNotice(
    table,
    `${escapeHTMLCharacters(user.username)} proposes the following options:${markup}`,
  );
  const owner = wsUsers.get(table.ownerID);
  if (owner !== undefined) {
    const options = {
      ...prepared.options,
      tableName: prepared.name,
      maxPlayers: prepared.maxPlayers,
    };
    wsSend(owner.connection, ServerCommand.chat, {
      msg: optionsSuggestion(options),
      who: PROJECT_NAME,
      source: "server",
      datetime: new Date().toISOString(),
      room: `table${table.id}`,
      recipient: owner.username,
    });
  }
}

export function cleanupDisconnectedTables(user: WSUser): void {
  for (const id of getTableIDsUserAttending(user.userID)) {
    scheduleTableCleanup(id, () => {
      const table = getTable(id);
      if (table === undefined || table.recoveryBlocked === true) {
        return;
      }
      if (table.running) {
        getGameRuntime()?.cleanupDisconnected(table);
        return;
      }
      // Re-scan all players so a saturated queue needs only one reserved cleanup slot.
      for (const player of table.players) {
        if (!wsUsers.has(player.userID)) {
          leaveTable(table, player);
        }
      }
    });
  }
}
