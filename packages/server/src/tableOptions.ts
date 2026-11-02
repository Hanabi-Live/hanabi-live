import type { ClientCommandData } from "@hanabi-live/data";
import type { NumPlayers, Options } from "@hanabi-live/game";
import { doesVariantExist, isValidNumPlayers } from "@hanabi-live/game";
import { escapeHTMLCharacters } from "complete-common";
import { trimUnicodeWhitespace, truncateToMaxBytes } from "./utils";
import { getRandomTableName } from "./words";
import { wsWarning } from "./wsHelpers";
import type { WSUser } from "./wsUsers";

export function optionsSuggestion(
  options: Options & {
    readonly tableName: string;
    readonly maxPlayers: number;
  },
): string {
  const encoded = escapeHTMLCharacters(
    JSON.stringify(options)
      .replaceAll("'", String.raw`\u0027`)
      .replaceAll('"', "'"),
  );
  return `<span class="cp"><button class="new-options" data-new-options="${encoded}">click to apply the suggestion</button></span>`;
}

export function prepareTableOptions(
  user: WSUser,
  data: ClientCommandData["tableCreate"],
  validateSpecialName = true,
):
  | {
      name: string;
      options: Options;
      maxPlayers: NumPlayers;
      seed: string;
      replay?: { databaseID: number; turn: number };
    }
  | undefined {
  const truncated =
    Buffer.byteLength(data.name) > 45
      ? truncateToMaxBytes(data.name, 44)
      : data.name;
  const trimmed = trimUnicodeWhitespace(truncated);
  const name = trimmed === "" ? getRandomTableName() : trimmed;
  if (!/^[\w !#$()+,\-.:;=?@]+$/u.test(name)) {
    wsWarning(
      user.connection,
      "Game names can only contain English letters, numbers, spaces, and ! @ # $ ( ) - _ = + ; : , . ?",
    );
    return undefined;
  }
  let seed = "";
  let replay: { databaseID: number; turn: number } | undefined;
  if (validateSpecialName && name.startsWith("!")) {
    if (data.gameJSON !== undefined && data.gameJSON !== null) {
      wsWarning(
        user.connection,
        "You cannot create a table with a special prefix if JSON data is also provided.",
      );
      return undefined;
    }
    const [command, ...args] = name.split(" ");
    if (command?.toLowerCase() === "!replay") {
      const databaseID = Number(args[0]);
      const turn = args[1] === undefined ? 1 : Number(args[1]);
      if (
        args.length === 0
        || args.length > 2
        || args.some((arg) => !/^[+-]?\d+$/u.test(arg))
        || !Number.isSafeInteger(databaseID)
        || databaseID < 1
        || databaseID > 2_147_483_647
        || !Number.isSafeInteger(turn)
        || turn < 1
      ) {
        wsWarning(
          user.connection,
          "Replays of specific games must be created in the form: !replay [game ID] [turn number], with positive integers.",
        );
        return undefined;
      }
      replay = { databaseID, turn: turn - 1 };
    } else if (command?.toLowerCase() === "!seed") {
      const [suffix] = args;
      if (args.length !== 1 || suffix === undefined) {
        wsWarning(
          user.connection,
          "Games on specific seeds must be created in the form: !seed [seed name]",
        );
        return undefined;
      }
      if (!/^[\d\-a-z]+$/iu.test(suffix)) {
        wsWarning(
          user.connection,
          "Seed names can only contain English letters, numbers and <code>-</code>",
        );
        return undefined;
      }
      seed = suffix;
    } else {
      wsWarning(
        user.connection,
        "You cannot start a game with an exclamation mark unless you are trying to use a specific game creation command.",
      );
      return undefined;
    }
  }
  const options: Options = {
    ...data.options,
    startingPlayer: 0,
    timed: data.options.timed && !data.options.speedrun,
    timeBase:
      data.options.timed && !data.options.speedrun ? data.options.timeBase : 0,
    timePerTurn:
      data.options.timed && !data.options.speedrun
        ? data.options.timePerTurn
        : 0,
    oneExtraCard: data.options.oneExtraCard && !data.options.oneLessCard,
    oneLessCard: data.options.oneLessCard && !data.options.oneExtraCard,
  };
  if (!doesVariantExist(options.variantName)) {
    wsWarning(
      user.connection,
      `"${escapeHTMLCharacters(options.variantName)}" is not a valid variant.`,
    );
    return undefined;
  }
  if (
    options.timed
    && (options.timeBase <= 0
      || options.timeBase > 604_800
      || options.timePerTurn <= 0
      || options.timePerTurn > 86_400)
  ) {
    wsWarning(
      user.connection,
      "Timed games require Base Time from 1 to 604800 seconds and Time per Turn from 1 to 86400 seconds.",
    );
    return undefined;
  }
  return {
    name,
    options,
    maxPlayers: isValidNumPlayers(data.maxPlayers) ? data.maxPlayers : 5,
    seed,
    ...(replay !== undefined && { replay }),
  };
}
