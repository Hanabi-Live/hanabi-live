import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { getCookieValue } from "../httpSession";

export async function httpTestCookie(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const userID = getCookieValue(request, "userID");

  return userID === undefined
    ? reply.code(StatusCodes.NO_CONTENT).send() // An empty reply will have `StatusCodes.OK`.
    : reply.send();
}
