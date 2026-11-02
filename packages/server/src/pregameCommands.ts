import type { TableID } from "@hanabi-live/data";
import { Status } from "@hanabi-live/data";
import { escapeHTMLCharacters } from "complete-common";
import { randomInt } from "node:crypto";
import { chatServerSendPM } from "./chat";
import { clearTyping } from "./chatPresence";
import { sendServerChat } from "./chatPublish";
import type { Table } from "./interfaces/Table";
import type { TablePlayer } from "./interfaces/TablePlayer";
import type { PregameStartIntent } from "./pregameStart";
import { cancelPregameStart } from "./pregameStart";
import {
  preparePregameStart,
  schedulePregameStart,
  startPregame,
} from "./pregameTimers";
import {
  cancelPregameCountdown,
  leaveTable,
  notifyJoined,
  notifyPregame,
  notifyTable,
  refreshPregameSpectators,
  removeEmptyPregameTable,
  tableNotice,
} from "./tableNotifications";
import { enqueueTableOperation } from "./tableQueue";
import { allocateTableID, getTable, publishTable } from "./tables";
import { normalizeString, truncateToMaxBytes } from "./utils";
import { wsWarning } from "./wsHelpers";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

export const PREGAME_COMMANDS: ReadonlySet<string> = new Set([
  "impostor",
  "kick",
  "s",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "sa",
  "si",
  "split",
  "splitauto",
  "startin",
]);

function isCurrent(user: WSUser) {
  return (
    wsUsers.get(user.userID) === user
    && user.connection.readyState === user.connection.OPEN
  );
}

export async function runPregameCommand(
  user: WSUser,
  tableID: TableID,
  command: string,
  args: readonly string[],
): Promise<void> {
  let intent: PregameStartIntent | undefined;
  let deferredNotice: string | undefined;
  const admitted = await enqueueTableOperation(tableID, () => {
    if (!isCurrent(user) || !PREGAME_COMMANDS.has(command)) {
      return;
    }
    const table = getTable(tableID);
    if (table === undefined) {
      return;
    }
    if (
      user.tableID !== table.id
      || table.players.every(
        (player) => !(player.userID === user.userID && player.present),
      )
    ) {
      chatServerSendPM(
        user,
        "You are not playing at this table.",
        `table${table.id}`,
      );
      return;
    }
    if (table.recoveryBlocked === true) {
      wsWarning(user.connection, "This table is frozen until recovery.");
      return;
    }
    if (table.running || table.replay) {
      deferredNotice =
        command === "kick"
        || command === "si"
        || command === "startin"
        || command === "split"
        || command === "splitauto"
        || command === "sa"
          ? "The game has not started yet, so you cannot use that command."
          : "The game is already started, so you cannot use that command.";
      return;
    }
    if (table.ownerID !== user.userID) {
      tableNotice(table, "Only the table owner can use that command.");
      return;
    }
    switch (command) {
      case "si":
      case "startin": {
        startIn(table, args);
        break;
      }

      case "kick": {
        kick(table, user, args);
        break;
      }

      case "split": {
        split(table, user, args);
        break;
      }

      case "splitauto":
      case "sa": {
        splitAuto(table, user);
        break;
      }

      case "impostor": {
        impostor(table);
        break;
      }

      default: {
        intent = automaticStart(table, command, args);
        break;
      }
    }
  });
  if (!admitted && isCurrent(user)) {
    wsWarning(
      user.connection,
      "Too many pending table commands. Please try again.",
    );
  }
  if (deferredNotice !== undefined) {
    await sendServerChat(deferredNotice, `table${tableID}`);
  }
  await startPregame(intent);
}

function automaticStart(
  table: Table,
  command: string,
  args: readonly string[],
) {
  const [argument] = args;
  let count =
    command === "s" ? table.players.length + 1 : Number(command.slice(1));
  if (argument !== undefined) {
    if (
      !/^[+-]?\d+$/u.test(argument)
      || !Number.isSafeInteger(Number(argument))
    ) {
      tableNotice(
        table,
        `"${escapeHTMLCharacters(argument)}" is not a number.`,
      );
      return undefined;
    }
    count = Number(argument);
    if (count < 2 || count > 6) {
      tableNotice(table, "You can only start a table with 2 to 6 players.");
      return undefined;
    }
  }
  if (table.players.length === count) {
    cancelPregameStart(table);
    return preparePregameStart(table);
  }
  if (table.pregameStartTimer === undefined) {
    cancelPregameStart(table);
  }
  const current = table;
  current.automaticStart = count;
  tableNotice(
    table,
    `The game will start as soon as ${count} players have joined.`,
  );
  return undefined;
}

function startIn(table: Table, args: readonly string[]) {
  const [argument] = args;
  if (args.length !== 1 || argument === undefined) {
    tableNotice(
      table,
      'You must specify the amount of minutes to wait. (e.g. "/startin 1")',
    );
    return;
  }
  const minutes = parseStartMinutes(argument);
  if (minutes === undefined) {
    tableNotice(
      table,
      `"${escapeHTMLCharacters(argument)}" is not a valid number.`,
    );
    return;
  }
  if (minutes <= 0) {
    tableNotice(table, "The minutes to wait must be greater than 0.");
    return;
  }
  if (minutes > 10) {
    tableNotice(table, "The minutes to wait cannot be greater than 10.");
    return;
  }
  const seconds = Math.ceil(minutes * 60);
  schedulePregameStart(table, seconds);
  let wait = `${escapeHTMLCharacters(argument)} minutes`;
  if (seconds < 60) {
    wait = `${seconds} seconds`;
  } else if (seconds === 60) {
    wait = "1 minute";
  }
  tableNotice(table, `The game will automatically start in ${wait}.`);
}

function parseStartMinutes(argument: string): number | undefined {
  // Go's ParseFloat accepts digit separators and hexadecimal floats after adding this zero.
  const value = `0${argument}`;
  if (
    /^\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?(?:e[+-]?\d(?:_?\d)*)?$/iu.test(value)
  ) {
    const parsed = Number(value.replaceAll("_", ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (
    !/^0x_?(?:[\da-f](?:_?[\da-f])*(?:\.(?:[\da-f](?:_?[\da-f])*)?)?|\.[\da-f](?:_?[\da-f])*)p[+-]?\d(?:_?\d)*$/iu.test(
      value,
    )
  ) {
    return undefined;
  }
  const [hex, power = "0"] = value
    .replaceAll("_", "")
    .toLowerCase()
    .split("p", 2);
  if (hex === undefined) {
    return undefined;
  }
  const [, fraction = ""] = hex.split(".", 2);
  const mantissa = BigInt(hex.replace(".", ""));
  if (mantissa === 0n) {
    return 0;
  }
  const exponent = Number(power) - 4 * fraction.length;
  const bits = mantissa.toString(2).length;
  if (exponent + bits < -1074) {
    return 0;
  }
  if (exponent + bits > 1024) {
    return undefined;
  }
  // Round once to binary64, including subnormal values, before converting to seconds.
  const shift = Math.max(0, bits - 53, -1074 - exponent);
  const divisor = 2n ** BigInt(shift);
  let rounded = mantissa / divisor;
  if (shift > 0) {
    const remainder = mantissa % divisor;
    const halfway = divisor / 2n;
    if (remainder > halfway || (remainder === halfway && rounded % 2n === 1n)) {
      rounded++;
    }
  }
  const parsed = Number(rounded) * 2 ** (exponent + shift);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function kick(table: Table, user: WSUser, args: readonly string[]) {
  const [argument] = args;
  if (args.length !== 1 || argument === undefined) {
    tableNotice(table, "The format of the /kick command is: /kick [username]");
    return;
  }
  const name = normalizeString(argument);
  if (name === normalizeString(user.username)) {
    tableNotice(table, "You cannot kick yourself.");
    return;
  }
  const player = table.players.find(
    (entry) => normalizeString(entry.name) === name,
  );
  if (player === undefined) {
    tableNotice(
      table,
      `"${escapeHTMLCharacters(argument)}" is not joined to this game.`,
    );
    return;
  }
  table.kickedPlayers.push(player.userID);
  leaveTable(table, player);
  tableNotice(
    table,
    `Successfully kicked "${escapeHTMLCharacters(argument)}" from the game.`,
  );
}

function impostor(table: Table) {
  if (table.players.length === 2) {
    tableNotice(
      table,
      "You can only perform this command when there are more than two players.",
    );
    return;
  }
  const chosen = randomInt(table.players.length);
  for (const [index, player] of table.players.entries()) {
    const user = wsUsers.get(player.userID);
    if (
      user !== undefined
      && isCurrent(user)
      && user.tableID === table.id
      && player.present
    ) {
      chatServerSendPM(
        user,
        index === chosen ? "You are an IMPOSTOR." : "You are a CREWMATE.",
        `table${table.id}`,
      );
    }
  }
}

function splitAuto(table: Table, user: WSUser) {
  if (table.players.length < 2) {
    tableNotice(table, "There must be at least 2 players to split.");
    return;
  }
  const sorted = table.players.toSorted(
    (a, b) => b.stats.numGames - a.stats.numGames,
  );
  const midpoint = Math.floor(sorted.length / 2);
  const top = sorted.slice(0, midpoint);
  // Match Go: the lower-count half gets the extra player, even if the owner is in the top half.
  const moved = top.some((player) => player.userID === table.ownerID)
    ? sorted.slice(midpoint)
    : top;
  if (moved.length === 0 || moved.length > table.maxPlayers) {
    tableNotice(
      table,
      "Cannot split: resulting group is empty or exceeds player limit.",
    );
    return;
  }
  split(
    table,
    user,
    moved.map((player) => player.name),
  );
}

function split(table: Table, user: WSUser, args: readonly string[]) {
  if (args.length === 0) {
    tableNotice(
      table,
      "The format of the /split command is: /split [username] [username] ...",
    );
    return;
  }
  const selected: TablePlayer[] = [];
  const seen = new Set<string>();
  for (const argument of args) {
    const name = normalizeString(argument);
    if (seen.has(name)) {
      tableNotice(
        table,
        "You cannot list the same player more than once in /split.",
      );
      return;
    }
    seen.add(name);
    const player = table.players.find(
      (entry) => normalizeString(entry.name) === name,
    );
    if (player === undefined) {
      tableNotice(
        table,
        `"${escapeHTMLCharacters(argument)}" is not joined to this table.`,
      );
      return;
    }
    selected.push(player);
  }
  const first = selected[0];
  if (first === undefined || selected.length > table.maxPlayers) {
    tableNotice(
      table,
      `You cannot split more than ${table.maxPlayers} players into one lobby.`,
    );
    return;
  }
  const previous = table.players;
  const remaining = previous.filter((player) => !selected.includes(player));
  const name = `${truncateToMaxBytes(table.name.trim(), 37)} (split)`.trim();
  const now = new Date();
  const destination: Table = {
    id: allocateTableID(),
    name,
    initialName: name,
    players: selected,
    maxPlayers: table.maxPlayers,
    spectators: [],
    kickedPlayers: [],
    ownerID: first.userID,
    visible: table.visible,
    passwordHash: table.passwordHash,
    running: false,
    replay: false,
    progress: 0,
    datetimeCreated: now,
    datetimeLastJoined: now,
    datetimePlannedStart: undefined,
    datetimeLastAction: now,
    game: undefined,
    options: { ...table.options },
    extraOptions: structuredClone(table.extraOptions),
    chat: [],
    chatRead: new Map(),
  };
  // Allocate and prepare everything before publishing either membership or notifications.
  publishTable(destination);
  cancelPregameCountdown(table);
  const current = table;
  current.players = remaining;
  if (selected.some((player) => player.userID === table.ownerID)) {
    current.ownerID = remaining[0]?.userID ?? table.ownerID;
  }
  refreshPregameSpectators(table, previous);
  const attendees: WSUser[] = [];
  for (const player of selected) {
    clearTyping(table, player.userID);
    table.chatRead.delete(player.userID);
    player.typing = false;
    const connected = wsUsers.get(player.userID);
    player.present =
      connected !== undefined
      && isCurrent(connected)
      && connected.tableID === table.id
      && player.present;
    if (connected !== undefined && player.present) {
      connected.status = Status.PreGame;
      connected.tableID = destination.id;
      attendees.push(connected);
    }
  }
  if (remaining.length === 0) {
    removeEmptyPregameTable(table);
  } else {
    notifyPregame(table);
    notifyTable(table);
  }
  notifyPregame(destination);
  notifyTable(destination);
  for (const attendee of attendees) {
    notifyJoined(destination, attendee);
  }
  tableNotice(
    table,
    `${escapeHTMLCharacters(user.username)} split ${selected.map((player) => escapeHTMLCharacters(player.name)).join(", ")} into a new lobby.`,
  );
  tableNotice(
    destination,
    `This lobby was created by splitting ${escapeHTMLCharacters(table.name)}.`,
  );
}
