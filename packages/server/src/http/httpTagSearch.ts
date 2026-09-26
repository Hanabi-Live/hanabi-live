import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { logger } from "../logger";
import { models } from "../models";
import { sanitizeTag } from "../tagUtils";

interface TagSearchParams {
  tag: string;
}

export async function httpAPITagSearch(
  request: FastifyRequest<{ Params: TagSearchParams }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const { tag: requestedTag } = request.params;
  if (requestedTag === "") {
    return await reply
      .code(StatusCodes.NOT_FOUND)
      .send("Error: You must specify a tag.");
  }

  const sanitized = sanitizeTag(requestedTag);
  if ("error" in sanitized) {
    return await reply.code(StatusCodes.NOT_FOUND).send(sanitized.error);
  }

  try {
    const gameIDs = await models.gameTags.getGameIDsForTag(sanitized.tag);
    const uniqueGameIDs = [...new Set(gameIDs)];
    const history = await models.games.getHistory(uniqueGameIDs);
    return await reply.send(
      history.toSorted((left, right) => right.id - left.id),
    );
  } catch (error) {
    logger.error(
      `Failed to search for games matching tag "${sanitized.tag}": ${String(error)}`,
    );
    return await reply
      .code(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Internal Server Error");
  }
}
