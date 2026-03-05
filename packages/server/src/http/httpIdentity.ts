import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { getCookieValue } from "../httpSession";
import {
  identityTokenIsExpired,
  identityTokenLookupHash,
  identityTokenPasswordHashMatches,
  identityTokenRegenerate,
} from "../identityToken";
import { logger } from "../logger";
import { models } from "../models";

interface IdentityTokenParams {
  token: string;
}

interface IdentityTokenResponse {
  username: string;
  token: string;
  expires_at: string;
}

interface IdentityLookupResponse {
  username: string;
}

async function getAuthenticatedUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<{ userID: number; username: string } | undefined> {
  const userID = getCookieValue(request, "userID");
  if (userID === undefined) {
    await reply.code(StatusCodes.UNAUTHORIZED).send({
      error: "You must be logged in.",
    });
    return undefined;
  }

  const user = await models.users.getUsername(userID);
  if (user === undefined) {
    await reply.code(StatusCodes.UNAUTHORIZED).send({
      error: "You must be logged in.",
    });
    return undefined;
  }

  return {
    userID,
    username: user,
  };
}

export async function httpIdentityTokenGet(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const auth = await getAuthenticatedUser(request, reply);
  if (auth === undefined) {
    return await reply;
  }

  const { userID, username } = auth;
  try {
    const row = await identityTokenRegenerate(userID);
    return await reply.send({
      username,
      token: row.token,
      expires_at: row.expiresAt.toUTCString(),
    } satisfies IdentityTokenResponse);
  } catch (error) {
    logger.error(
      `Failed to regenerate identity token for user "${username}": ${String(error)}`,
    );
    return await reply
      .code(StatusCodes.INTERNAL_SERVER_ERROR)
      .send({ error: "Internal Server Error" });
  }
}

export async function httpIdentityTokenPost(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const auth = await getAuthenticatedUser(request, reply);
  if (auth === undefined) {
    return await reply;
  }

  const { userID, username } = auth;

  try {
    const row = await identityTokenRegenerate(userID);
    return await reply.send({
      username,
      token: row.token,
      expires_at: row.expiresAt.toUTCString(),
    } satisfies IdentityTokenResponse);
  } catch (error) {
    logger.error(
      `Failed to regenerate identity token for user "${username}": ${String(error)}`,
    );
    return await reply
      .code(StatusCodes.INTERNAL_SERVER_ERROR)
      .send({ error: "Internal Server Error" });
  }
}

export async function httpIdentityLookup(
  request: FastifyRequest<{ Params: IdentityTokenParams }>,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const { token } = request.params;
  if (token === "") {
    return await reply.code(StatusCodes.BAD_REQUEST).send({
      error: "Missing identity token.",
    });
  }

  let tokenLookupHash: string;
  try {
    tokenLookupHash = identityTokenLookupHash(token);
  } catch (error) {
    logger.error(
      `Failed to compute identity token lookup hash: ${String(error)}`,
    );
    return await reply
      .code(StatusCodes.INTERNAL_SERVER_ERROR)
      .send({ error: "Internal Server Error" });
  }

  const row =
    await models.userIdentityTokens.getUsernameByTokenLookupHash(
      tokenLookupHash,
    );
  if (row === undefined || identityTokenIsExpired(row.expiresAt)) {
    return await reply.code(StatusCodes.NOT_FOUND).send({
      error: "Identity token not found.",
    });
  }
  const tokenMatches = await identityTokenPasswordHashMatches(
    token,
    row.tokenHash,
  );
  if (!tokenMatches) {
    return await reply.code(StatusCodes.NOT_FOUND).send({
      error: "Identity token not found.",
    });
  }

  return await reply.send({
    username: row.username,
  } satisfies IdentityLookupResponse);
}
