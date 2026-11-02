import type { UserID } from "@hanabi-live/data";
import {
  doesVariantIDExist,
  getVariant,
  VARIANT_NAMES,
} from "@hanabi-live/game";
import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import type { PublicGameQuery, PublicGameSelection } from "../apiQuery";
import { parseAPIInteger, parseGameQuery } from "../apiQuery";
import { models } from "../models";
import { normalizeString } from "../utils";

type APIRequest = FastifyRequest<{
  Params: Record<string, string | undefined>;
  Querystring: Record<string, string | readonly string[] | undefined>;
}>;

// Resolve at most six names sequentially and stop on the first invalid participant.
/* eslint-disable no-await-in-loop */
async function players(
  request: APIRequest,
  reply: FastifyReply,
): Promise<readonly UserID[] | undefined> {
  const ids: UserID[] = [];
  const seen = new Set<string>();
  for (let index = 1; index <= 6; index++) {
    const name = request.params[`player${index}`];
    if (name === undefined || name === "") {
      if (index === 1) {
        await reply
          .code(StatusCodes.NOT_FOUND)
          .send("Error: You must specify a player.");
        return undefined;
      }
      break;
    }
    const normalized = normalizeString(name);
    if (seen.has(normalized)) {
      await reply
        .code(StatusCodes.NOT_FOUND)
        .send("Error: You can not specify the same player twice.");
      return undefined;
    }
    seen.add(normalized);
    const user = await models.users.getByNormalizedUsername(normalized);
    if (user === undefined) {
      await reply
        .code(StatusCodes.NOT_FOUND)
        .send(`Error: The player of "${name}" does not exist in the database.`);
      return undefined;
    }
    ids.push(user.id);
  }
  return ids;
}
/* eslint-enable no-await-in-loop */

function first(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}

async function listGames(
  request: APIRequest,
  reply: FastifyReply,
  mode: "history" | "seed" | "variant",
) {
  let selection: PublicGameSelection;
  if (mode === "history") {
    const userIDs = await players(request, reply);
    if (userIDs === undefined) {
      return await reply;
    }
    selection = { userIDs };
  } else if (mode === "variant") {
    const id = parseAPIInteger(request.params["id"]);
    if (id === undefined || !doesVariantIDExist(id)) {
      return await reply.code(StatusCodes.BAD_REQUEST).send({
        total_rows: 0,
        info: "Missing valid variant ID",
        rows: null, // eslint-disable-line unicorn/no-null
      });
    }
    selection = { variantID: id };
  } else {
    const { seed } = request.params;
    if (seed === undefined || seed === "") {
      return await reply.code(StatusCodes.BAD_REQUEST).send({
        total_rows: 0,
        info: "Missing seed",
        rows: null, // eslint-disable-line unicorn/no-null
      });
    }
    selection = { seed };
  }
  let query: PublicGameQuery;
  try {
    query = { ...parseGameQuery(request.query, mode), ...selection };
  } catch (error) {
    if (!(error instanceof RangeError)) {
      throw error;
    }
    return await reply.code(StatusCodes.BAD_REQUEST).send({
      total_rows: 0,
      info: error.message,
      rows: null, // eslint-disable-line unicorn/no-null
    });
  }
  const result = await models.gameQueries.list(query);
  const rows =
    mode === "variant"
      ? result.rows.map((row) => ({
          id: row.id,
          num_players: row.num_players,
          score: row.score,
          users: row.users,
          datetime: row.datetime,
          seed: row.seed,
        }))
      : result.rows;
  const info =
    mode === "variant"
      ? "Params: size=0...100, page=0..., col[0]=0|1 (sort by id ASC|DESC), fcol[x]=value (filter by 0: id, 1: num_players, 2: score)"
      : "Params: size=0...100, page=0..., col[0]=0|1 (sort by id ASC|DESC), fcol[x]=value (filter by 0: id, 2: score)";
  return await reply.send({ total_rows: result.totalRows, info, rows });
}

export async function httpAPIHistory(
  request: APIRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  return await listGames(request, reply, "history");
}

export async function httpAPISeed(
  request: APIRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  return await listGames(request, reply, "seed");
}

export async function httpAPIVariantGames(
  request: APIRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  return await listGames(request, reply, "variant");
}

export async function httpAPIVariants(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const entries = VARIANT_NAMES.map((name) => {
    const variant = getVariant(name);
    return [variant.id, name] as const;
  });
  return await reply.send(Object.fromEntries(entries));
}

export async function httpAPIVariantsFull(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const entries = VARIANT_NAMES.map((name) => {
    const variant = getVariant(name);
    return [
      variant.id,
      {
        name,
        suits: variant.suits.map((suit) => suit.name),
        stackSize: variant.stackSize,
        maxScore: variant.suits.length * variant.stackSize,
      },
    ] as const;
  });
  return await reply.send(Object.fromEntries(entries));
}

export async function httpAPIHistoryFull(
  request: APIRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const userIDs = await players(request, reply);
  if (userIDs === undefined) {
    return await reply;
  }
  const start = parseAPIInteger(first(request.query["start"]));
  const end = parseAPIInteger(first(request.query["end"]));
  const ids = await models.gameQueries.fullIDs({
    userIDs,
    ...(start !== undefined && { start }),
    ...(end !== undefined && { end }),
  });
  return await reply.send(await models.games.getHistory(ids));
}

export async function httpAPISeedFull(
  request: APIRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const { seed } = request.params;
  if (seed === undefined || seed === "") {
    return await reply.code(StatusCodes.BAD_REQUEST).send("Missing seed.");
  }
  const ids = await models.games.getGameIDsForSeed(seed);
  return await reply.send(await models.games.getHistory(ids, "seed"));
}
