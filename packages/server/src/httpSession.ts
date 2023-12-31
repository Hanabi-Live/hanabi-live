import type { FastifyRequest } from "fastify";
import type { UserID } from "../../data/src/types/UserID";

interface HTTPSessionData {
  userID?: UserID;
}

/** Delete the session cookie server-side (which will invalidate the cookie going forward). */
export function deleteCookie(request: FastifyRequest): void {
  request.session.delete();
}

export function getCookieValue<T extends keyof HTTPSessionData>(
  request: FastifyRequest,
  key: T,
): HTTPSessionData[T] {
  // By default, the secure session library is typed to return `any`.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return request.session.get(key);
}

export function setCookieValue<T extends keyof HTTPSessionData>(
  request: FastifyRequest,
  key: T,
  value: HTTPSessionData[T],
): void {
  request.session.set(key, value);
}
