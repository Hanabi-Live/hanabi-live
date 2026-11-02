import type { UserID } from "@hanabi-live/data";
import { getVariant, VARIANT_NAMES } from "@hanabi-live/game";
import { assertDefined, escapeHTMLCharacters } from "complete-common";
import { randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { chatServerSendPM } from "./chat";
import { sendServerChat } from "./chatPublish";
import { parseChatTarget } from "./chatTarget";
import { env } from "./env";
import type { Table } from "./interfaces/Table";
import type { UserStatsRow } from "./interfaces/UserStatsRow";
import responsesJSON from "./json/chatReplyCommands.json";
import { models } from "./models";
import { PREGAME_COMMANDS, runPregameCommand } from "./pregameCommands";
import { getShutdownControl } from "./shutdown";
import { optionsSuggestion } from "./tableOptions";
import { getTable } from "./tables";
import { getCameOnline, getUptime } from "./uptime";
import type { WSUser } from "./wsUsers";
import { wsUsers } from "./wsUsers";

const responseSchema = z.object({
  command: z.string().min(1),
  response: z.string(),
  alias: z.string().array().default([]),
  private: z.boolean().default(false),
  isHelp: z.boolean().default(false),
});
const missingCommands = new Set([
  "m",
  "missing",
  "missing-scores",
  "missingscores",
  "shared-missing-scores",
  "sharedmissingscores",
]);
const variantCommands = new Set([
  "find-variant",
  "findvariant",
  "fv",
  "random-variant",
  "randomvariant",
]);
const websiteCommands = new Set([
  "f",
  "friend",
  "friends",
  "link",
  "linked",
  "msg",
  "pm",
  "terminate",
  "unfriend",
  "unlink",
  "version",
  "w",
  "whisper",
]);
const knownCommands = new Set([
  "random",
  "replay",
  "suggest",
  "taglist",
  "tags",
  "timeleft",
  "token",
  "uptime",
  ...PREGAME_COMMANDS,
  ...missingCommands,
  ...variantCommands,
  ...websiteCommands,
]);
const simpleResponses = new Map<string, z.infer<typeof responseSchema>>();
const helpNames = [...knownCommands].map((command) => `/${command}`);
for (const response of responseSchema.array().parse(responsesJSON)) {
  helpNames.push(`/${response.command}`);
  for (const command of [response.command, ...response.alias]) {
    knownCommands.add(command);
    simpleResponses.set(command, response);
  }
}
const help = helpNames.toSorted().join(", ").replaceAll("-", "&#8209;");

function parseChatCommand(text: string):
  | {
      readonly command: string;
      readonly args: readonly string[];
    }
  | undefined {
  const [first, ...args] = text.split(" ");
  if (first === undefined || first === "/" || !first.startsWith("/")) {
    return undefined;
  }
  return { command: first.slice(1).toLowerCase(), args };
}

export function classifyChatMessage(
  text: string,
): "text" | "public" | "private" | "unknown" {
  const parsed = parseChatCommand(text);
  if (parsed === undefined) {
    return "text";
  }
  if (parsed.command === "token") {
    return "private";
  }
  return knownCommands.has(parsed.command) ? "public" : "unknown";
}

export function invalidChatCommand(
  user: WSUser,
  text: string,
  room: string,
): void {
  const parsed = parseChatCommand(text);
  assertDefined(parsed, "Expected an invalid slash command.");
  chatServerSendPM(
    user,
    `The chat command of <code>/${escapeHTMLCharacters(parsed.command)}</code> is not valid. Use <code>/help</code> to get a list of available commands.`,
    room,
  );
}

export function isSplitCommand(text: string): boolean {
  const parsed = parseChatCommand(text);
  return (
    parsed !== undefined
    && ["sa", "split", "splitauto"].includes(parsed.command)
  );
}

function commandTable(room: string): Table | undefined {
  const target = parseChatTarget(room);
  if (target?.kind !== "table") {
    return undefined;
  }
  return getTable(target.tableID as Table["id"]);
}

function url(path: string) {
  const protocol =
    env.TLS_CERT_FILE !== "" && env.TLS_KEY_FILE !== "" ? "https" : "http";
  return `${protocol}://${env.DOMAIN}${path}`;
}

function integer(text: string): bigint | undefined {
  if (!/^[+-]?\d+$/u.test(text)) {
    return undefined;
  }
  const value = BigInt(text);
  return value >= -(2n ** 63n) && value < 2n ** 63n ? value : undefined;
}

function numericError(argument: string, command: string, noun: string) {
  return argument.trim() !== "" && !Number.isNaN(Number(argument))
    ? `The /${command} command only accepts integers.`
    : `"${escapeHTMLCharacters(argument)}" is not ${noun}.`;
}

function replayLink(args: readonly string[]) {
  const first = args[0];
  if (first === undefined) {
    return "The format of the /replay command is: /replay [game ID] [turn number]";
  }
  const id = integer(first);
  if (id === undefined) {
    return numericError(first, "replay", "a number");
  }
  const turnText = args[1];
  if (turnText === undefined) {
    return url(`/replay/${id}`);
  }
  const turn = integer(turnText);
  return turn === undefined
    ? numericError(turnText, "replay", "a number")
    : url(`/replay/${id}#${turn}`);
}

function randomResponse(args: readonly string[]) {
  const first = args[0];
  if (first === undefined || args.length > 2) {
    return "The format of the /random command is: /random [min] [max]";
  }
  const one = integer(first);
  if (one === undefined) {
    return numericError(first, "random", "an integer");
  }
  const second = args[1];
  const two = second === undefined ? undefined : integer(second);
  if (second !== undefined && two === undefined) {
    return numericError(second, "random", "an integer");
  }
  const min = two === undefined ? 1n : one;
  const max = two ?? one;
  if (min >= max) {
    return `${min} is greater than or equal to ${max}, so that request is nonsensical.`;
  }
  const range = max - min + 1n;
  const ceiling = 2n ** 64n;
  const limit = ceiling - (ceiling % range);
  let draw: bigint;
  do {
    draw = randomBytes(8).readBigUInt64LE();
  } while (draw >= limit);
  return `Random number between ${min} and ${max}: ${min + (draw % range)}`;
}

function participants(
  table: Table,
): ReadonlyArray<{ userID: UserID; name: string }> {
  return table.replay ? table.spectators : table.players;
}

async function findVariant(table: Table, room: string) {
  const players = participants(table);
  const stats = await Promise.all(
    players.map(async (player) => await models.userStats.getAll(player.userID)),
  );
  const missing = VARIANT_NAMES.filter((name) => {
    const variant = getVariant(name);
    return stats.every(
      (values: ReadonlyMap<number, UserStatsRow>) =>
        values.get(variant.id)?.bestScores[players.length - 2]?.score
        !== variant.maxScore,
    );
  });
  if (missing.length === 0) {
    await sendServerChat("No missing variants for this team.", room);
    return;
  }
  const variant = missing[randomInt(missing.length)];
  assertDefined(variant, "Missing selected variant.");
  await sendServerChat(
    `Here is a random variant that everyone needs the ${players.length}-player max score in: ${variant}`,
    room,
  );
  const current = getTable(table.id);
  if (current === table && !current.running && !current.replay) {
    const owner = wsUsers.get(current.ownerID);
    if (owner?.tableID === current.id) {
      chatServerSendPM(
        owner,
        optionsSuggestion({
          ...current.options,
          variantName: variant,
          tableName: current.name,
          maxPlayers: current.maxPlayers,
        }),
        room,
      );
    }
  }
}

export async function executeChatCommand(
  user: WSUser | undefined,
  text: string,
  room: string,
): Promise<void> {
  const parsed = parseChatCommand(text);
  assertDefined(parsed, "Expected a slash command.");
  const { command, args } = parsed;
  const response = simpleResponses.get(command);
  if (response !== undefined) {
    const content = response.isHelp
      ? `<br>List of commands:<br>${help}<br>${response.response}`
      : response.response;
    if (response.private) {
      if (user !== undefined && wsUsers.get(user.userID) === user) {
        chatServerSendPM(user, content, room);
      }
    } else {
      await sendServerChat(content, room);
    }
    return;
  }
  if (websiteCommands.has(command)) {
    await sendServerChat(
      "You cannot perform that command from Discord; please use the website instead.",
      room,
    );
    return;
  }
  switch (command) {
    case "replay": {
      await sendServerChat(replayLink(args), room);
      return;
    }

    case "random": {
      await sendServerChat(randomResponse(args), room);
      return;
    }

    case "uptime": {
      await sendServerChat(getCameOnline(), room);
      await sendServerChat(getUptime(), room);
      return;
    }

    case "timeleft": {
      await sendServerChat(
        getShutdownControl()?.timeLeft()
          ?? "The server is not scheduled to shutdown any time soon.",
        room,
      );
      return;
    }

    case "token": {
      throw new Error(
        "Private token commands cannot execute through public chat.",
      );
    }

    default: {
      break;
    }
  }
  const table = commandTable(room);
  if (table === undefined) {
    await sendServerChat(
      "You can only perform this command while in a game.",
      room,
    );
    return;
  }
  if (PREGAME_COMMANDS.has(command)) {
    assertDefined(user, "Table chat commands require an authenticated player.");
    await runPregameCommand(user, table.id, command, args);
    return;
  }
  if (missingCommands.has(command) || variantCommands.has(command)) {
    const players = participants(table);
    if (players.length < 2 || players.length > 6) {
      await sendServerChat(
        "You can only perform this command if the game or shared replay has between 2 and 6 players.",
        room,
      );
    } else if (missingCommands.has(command)) {
      await sendServerChat(
        url(
          `/shared-missing-scores/${players.length}/${players.map((player) => encodeURIComponent(player.name)).join("/")}`,
        ),
        room,
      );
    } else {
      await findVariant(table, room);
    }
    return;
  }
  if (!table.replay) {
    await sendServerChat(
      "You can only perform this command while in a replay.",
      room,
    );
    return;
  }
  if (command === "suggest") {
    const turn = args[0];
    if (args.length !== 1 || turn === undefined) {
      await sendServerChat(
        "The format of the /suggest command is: /suggest [turn]",
        room,
      );
    } else if (integer(turn) === undefined) {
      await sendServerChat(numericError(turn, "suggest", "a number"), room);
    }
    return;
  }
  if (command === "tags" || command === "taglist") {
    const id = table.game?.databaseID;
    assertDefined(id, "Missing replay database identity.");
    const tags = await models.gameTags.getAll(id);
    if (tags.length === 0) {
      await sendServerChat("There are not yet any tags for this game.", room);
      return;
    }
    await sendServerChat(
      "The list of tags for this game are as follows:",
      room,
    );
    for (const [index, tag] of tags.entries()) {
      // eslint-disable-next-line no-await-in-loop
      await sendServerChat(`${index + 1}) ${escapeHTMLCharacters(tag)}`, room);
    }
    return;
  }
  throw new Error("Unregistered chat command reached the dispatcher.");
}
