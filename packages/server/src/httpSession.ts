import type { CookieSerializeOptions } from "@fastify/cookie";
import { fastifyCookie } from "@fastify/cookie";
import type { UserID } from "@hanabi-live/data";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env, IS_DEV } from "./env";
import {
  decodeSessionCookie,
  encodeSessionCookie,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "./sessionCookie";

interface SessionState {
  userID: UserID | undefined;
  changed: boolean;
}

const states = new WeakMap<FastifyRequest, SessionState>();

export async function registerHTTPSessions(
  server: FastifyInstance,
  useTLS: boolean,
): Promise<void> {
  await server.register(fastifyCookie);
  const options = {
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    // Go does not percent-decode cookie values.
    encode: (value: string) => value,
    ...(!IS_DEV && {
      domain: env.DOMAIN,
      secure: useTLS,
      httpOnly: true,
      sameSite: "strict",
    }),
  } satisfies CookieSerializeOptions;

  server.addHook("onRequest", (request, _reply, done) => {
    const cookie = request.cookies[SESSION_COOKIE_NAME];
    states.set(request, {
      userID:
        cookie === undefined
          ? undefined
          : decodeSessionCookie(cookie, env.SESSION_SECRET),
      changed: false,
    });
    done();
  });
  server.addHook("onSend", (request, reply, _payload, done) => {
    const state = states.get(request);
    if (state?.changed === true) {
      if (state.userID === undefined) {
        reply.clearCookie(SESSION_COOKIE_NAME, options);
      } else {
        reply.setCookie(
          SESSION_COOKIE_NAME,
          encodeSessionCookie(state.userID, env.SESSION_SECRET),
          options,
        );
      }
    }
    done();
  });
}

function session(request: FastifyRequest): SessionState {
  const state = states.get(request);
  if (state === undefined) {
    throw new Error("HTTP session hooks were not initialized.");
  }
  return state;
}

/** Expire the browser cookie; copied signed cookies remain valid until expiry. */
export function deleteCookie(request: FastifyRequest): void {
  const state = session(request);
  state.userID = undefined;
  state.changed = true;
}

export function getCookieValue(
  request: FastifyRequest,
  key: "userID",
): UserID | undefined {
  return session(request)[key];
}

export function setCookieValue(
  request: FastifyRequest,
  key: "userID",
  value: UserID | undefined,
): void {
  const state = session(request);
  state[key] = value;
  state.changed = true;
}
