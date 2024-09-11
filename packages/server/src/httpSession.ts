import type { SessionData } from "@fastify/secure-session";
import type { UserID } from "@hanabi/data";
import type { FastifyRequest } from "fastify";

/**
 * @see https://github.com/fastify/fastify-secure-session?tab=readme-ov-file#add-typescript-types
 */
declare module "@fastify/secure-session" {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  interface SessionData {
    userID?: UserID;
  }
}

/** Delete the session cookie server-side (which will invalidate the cookie going forward). */
export function deleteCookie(request: FastifyRequest): void {
  request.session.delete();
}

export function getCookieValue<T extends keyof SessionData>(
  request: FastifyRequest,
  key: T,
): SessionData[T] | undefined {
  return request.session.get(key);
}

export function setCookieValue<T extends keyof SessionData>(
  request: FastifyRequest,
  key: T,
  value: SessionData[T],
): void {
  request.session.set(key, value);
}
