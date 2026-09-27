import type { GameID } from "@hanabi-live/data";
import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { logger } from "../logger";
import { models } from "../models";
import { normalizeString } from "../utils";

interface TagsParams {
  player1: string;
}

function compareTags(left: string, right: string): number {
  const leftCodePoints = Array.from(
    left,
    (character) => character.codePointAt(0) ?? 0,
  );
  const rightCodePoints = Array.from(
    right,
    (character) => character.codePointAt(0) ?? 0,
  );
  for (
    let index = 0;
    index < Math.min(leftCodePoints.length, rightCodePoints.length);
    index++
  ) {
    const difference =
      (leftCodePoints[index] ?? 0) - (rightCodePoints[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return leftCodePoints.length - rightCodePoints.length;
}

export async function httpAPITags(
  request: FastifyRequest<{ Params: TagsParams }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const { player1 } = request.params;
  try {
    const userID = await models.users.getIDByNormalizedUsername(
      normalizeString(player1),
    );
    if (userID === undefined) {
      return await reply
        .code(StatusCodes.NOT_FOUND)
        .send("Error: That player does not exist in the database.");
    }

    const userTags = await models.gameTags.getForUser(userID);
    const tagsByGame = new Map<GameID, string[]>();
    for (const { gameID, tag } of userTags) {
      const tags = tagsByGame.get(gameID) ?? [];
      tags.push(tag);
      tagsByGame.set(gameID, tags);
    }

    const history = await models.games.getHistory([...tagsByGame.keys()]);
    return await reply.send(
      history
        .toSorted((left, right) => right.id - left.id)
        .map((game) => ({
          ...game,
          tags: (tagsByGame.get(game.id as GameID) ?? [])
            .toSorted(compareTags)
            .join(", "),
        })),
    );
  } catch (error) {
    logger.error(
      `Failed to get tagged games for "${player1}": ${String(error)}`,
    );
    return await reply
      .code(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Internal Server Error");
  }
}
