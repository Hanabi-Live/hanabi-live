import type { FastifyReply, FastifyRequest } from "fastify";
import { StatusCodes } from "http-status-codes";
import { deleteCookie } from "../httpSession";

export async function httpLogout(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  deleteCookie(request);

  return await reply
    // We need tell tell the browser to not cache the redirect:
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching
    // Otherwise, after the first logout, the redirect would be cached, and then on the second
    // logout and beyond, the browser would not actually send a GET request to "/logout"
    .header("Cache-Control", "no-store")
    .redirect("/", StatusCodes.MOVED_PERMANENTLY);
}
