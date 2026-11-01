import type { UserID } from "@hanabi-live/data";
import { isArray } from "complete-common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { getTemplateVariables } from "../httpUtils";
import type { TemplateVariables } from "../interfaces/TemplateVariables";
import type { UserStatsRow } from "../interfaces/UserStatsRow";
import { logger } from "../logger";
import { models } from "../models";
import {
  getSharedMissingScoresRows,
  parseCommaSeparated,
  parseFloatStrict,
} from "../sharedMissingScores";
import { normalizeString } from "../utils";

const MAX_PLAYERS = 6;

interface SharedMissingScoresParams {
  numPlayers: string;
  player1?: string;
  player2?: string;
  player3?: string;
  player4?: string;
  player5?: string;
  player6?: string;
}

interface SharedMissingScoresQuery {
  excludePlayers?: string | string[];
  excludeVariants?: string | string[];
  minEfficiency?: string | string[];
  maxEfficiency?: string | string[];
}

interface PlayerUser {
  readonly id: UserID;
  readonly username: string;
}

/**
 * Checks the players in the order of the URL, so that the first problem is the one that is
 * reported.
 *
 * @param urlNames The names of the players, as they were typed in the URL.
 * @param lookups The users from the database that correspond to the names (or `undefined` if the
 *                player does not exist).
 * @returns The error to respond with, or `undefined` if there is no problem.
 */
function getPlayersError(
  urlNames: readonly string[],
  lookups: ReadonlyArray<PlayerUser | undefined>,
): { statusCode: number; message: string } | undefined {
  const normalizedUrlNames: string[] = [];
  for (const [i, urlName] of urlNames.entries()) {
    // Check to see if this is a duplicate player, e.g. "/Alice/Bob/bob".
    const normalizedUsername = normalizeString(urlName);
    if (normalizedUrlNames.includes(normalizedUsername)) {
      return {
        statusCode: StatusCodes.NOT_FOUND,
        message: "Error: You can not specify the same player twice.",
      };
    }
    normalizedUrlNames.push(normalizedUsername);

    if (lookups[i] === undefined) {
      return {
        statusCode: StatusCodes.NOT_FOUND,
        message: `Error: The player of "${urlName}" does not exist in the database.`,
      };
    }
  }

  return undefined;
}

/** If a query parameter is specified more than once, only the first value is used. */
function getQueryValue(value: string | string[] | undefined): string {
  const firstValue = isArray(value) ? value[0] : value;
  return firstValue ?? "";
}

/**
 * The page that shows the variants that none of the specified players have a perfect score in,
 * e.g. "/shared-missing-scores/3/Alice/Bob/Cathy". It can be filtered with query parameters, e.g.
 * "?excludePlayers=Cathy&excludeVariants=Duck&maxEfficiency=1.5".
 */
export async function httpSharedMissingScores(
  request: FastifyRequest<{
    Params: SharedMissingScoresParams;
    Querystring: SharedMissingScoresQuery;
  }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const { params, query } = request;

  // Parse the number of players from the URL.
  const numPlayers = /^[+-]?\d+$/u.test(params.numPlayers)
    ? Number(params.numPlayers)
    : NaN;
  if (!Number.isSafeInteger(numPlayers)) {
    return await reply
      .code(StatusCodes.BAD_REQUEST)
      .send("Error: You must first specify the number of players.");
  }
  if (numPlayers < 2 || numPlayers > MAX_PLAYERS) {
    return await reply
      .code(StatusCodes.BAD_REQUEST)
      .send("Error: Number of players must be between 2 and 6.");
  }

  // Parse the player name(s) from the URL.
  const urlNames = [
    params.player1,
    params.player2,
    params.player3,
    params.player4,
    params.player5,
    params.player6,
  ].filter((name): name is string => name !== undefined && name !== "");
  if (urlNames.length === 0) {
    return await reply
      .code(StatusCodes.NOT_FOUND)
      .send("Error: You must specify a player.");
  }

  // Check which of the players exist. (The lookups run in parallel.)
  let lookups: ReadonlyArray<PlayerUser | undefined>;
  try {
    lookups = await Promise.all(
      urlNames.map(
        async (name) =>
          await models.users.getByNormalizedUsername(normalizeString(name)),
      ),
    );
  } catch (error) {
    logger.error(
      `Failed to look up the players "${urlNames.join('", "')}": ${String(error)}`,
    );
    return await reply
      .code(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Internal Server Error");
  }

  const playersError = getPlayersError(urlNames, lookups);
  if (playersError !== undefined) {
    return await reply.code(playersError.statusCode).send(playersError.message);
  }
  const users = lookups.filter((user) => user !== undefined);

  if (users.length < 2) {
    return await reply
      .code(StatusCodes.NOT_FOUND)
      .send("Error: You must specify at least two players.");
  }

  // Parse the advanced filters from the query string.
  const excludedPlayers = parseCommaSeparated(
    getQueryValue(query.excludePlayers),
  );
  const excludeVariants = getQueryValue(query.excludeVariants).trim();
  const excludedVariants = parseCommaSeparated(excludeVariants);
  const minEfficiencyString = getQueryValue(query.minEfficiency).trim();
  const maxEfficiencyString = getQueryValue(query.maxEfficiency).trim();
  const minEfficiency =
    minEfficiencyString === ""
      ? undefined
      : parseFloatStrict(minEfficiencyString);
  if (minEfficiencyString !== "" && minEfficiency === undefined) {
    return await reply
      .code(StatusCodes.BAD_REQUEST)
      .send("Error: The minimum efficiency must be a number.");
  }
  const maxEfficiency =
    maxEfficiencyString === ""
      ? undefined
      : parseFloatStrict(maxEfficiencyString);
  if (maxEfficiencyString !== "" && maxEfficiency === undefined) {
    return await reply
      .code(StatusCodes.BAD_REQUEST)
      .send("Error: The maximum efficiency must be a number.");
  }

  // Figure out which players will be used in the calculation.
  const players = users.map(({ username }) => ({
    name: username,
    excluded: excludedPlayers.includes(normalizeString(username)),
  }));
  const includedUsers = users.filter((_, i) => players[i]?.excluded === false);
  if (includedUsers.length === 0) {
    return await reply
      .code(StatusCodes.BAD_REQUEST)
      .send("Error: You can not exclude every player.");
  }

  // Get all of the variant-specific stats for each included player.
  let statsPerPlayer: ReadonlyArray<Map<number, UserStatsRow>>;
  try {
    statsPerPlayer = await Promise.all(
      includedUsers.map(async ({ id }) => await models.userStats.getAll(id)),
    );
  } catch (error) {
    logger.error(
      `Failed to get all of the variant-specific stats for the players: ${String(error)}`,
    );
    return await reply
      .code(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Internal Server Error");
  }

  const rows = getSharedMissingScoresRows(numPlayers, statsPerPlayer, {
    excludedVariants,
    minEfficiency,
    maxEfficiency,
  });

  const playerNames = users.map(({ username }) => username);
  const lastName = playerNames.at(-1);
  const advancedFiltersActive =
    includedUsers.length < users.length
    || excludedVariants.length > 0
    || minEfficiencyString !== ""
    || maxEfficiencyString !== "";

  // The template engine only accepts strings, numbers, and booleans, so the lists are passed as
  // JSON. Filter values that are empty are left out, since the template engine also rejects empty
  // strings.
  return await reply.view("missing-scores", {
    ...getTemplateVariables(),
    title: "Missing Scores",
    namesTitle: `Missing Scores for ${playerNames.slice(0, -1).join(", ")} and ${lastName}`,
    advancedFiltersActive,
    playersJSON: JSON.stringify(players),
    rowsJSON: JSON.stringify(rows),
    ...(excludeVariants !== "" && { excludeVariants }),
    ...(minEfficiencyString !== "" && { minEfficiency: minEfficiencyString }),
    ...(maxEfficiencyString !== "" && { maxEfficiency: maxEfficiencyString }),
  } satisfies TemplateVariables);
}
