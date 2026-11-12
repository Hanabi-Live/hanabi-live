// Checks the live site the way a returning player reaches it after a deployment: it signs in a
// shared test account over HTTPS, then opens a WebSocket with the client version that the site
// serves, and waits for the lobby's first messages. It exits with an error if any step fails. When
// the site serves this checkout's revision, it also validates every payload with the generated
// schemas; otherwise those schemas may differ from the deployed ones, so it skips that.

import type { ServerCommand } from "@hanabi-live/data";
import {
  SERVER_COMMAND_SCHEMAS,
  unpackWsMessage,
  userRefSchema,
} from "@hanabi-live/data";
import { $ } from "bun";

const SITE = "hanab.live";
/** A shared test account; connecting replaces any other session that it has. */
const ACCOUNT = "test3";
const TIMEOUT_MS = 30_000;
/** The messages that every new connection receives before it can use the lobby. */
const REQUIRED = ["welcome", "userList", "tableList"] as const;

const serverSchemas: Readonly<
  Partial<Record<string, (typeof SERVER_COMMAND_SCHEMAS)[ServerCommand]>>
> = SERVER_COMMAND_SCHEMAS;

/**
 * Bun's WebSocket, which can send the session cookie. This package also loads the DOM's types,
 * whose constructor takes only protocols and hides Bun's.
 */
const BunWebSocket = WebSocket as unknown as new (
  url: string,
  options: Bun.WebSocketOptions,
) => WebSocket;

function fail(message: string): never {
  console.error(`Deployment check failed: ${message}`);
  process.exit(1);
}

/** The client version is the revision of the deployed release. */
async function servedVersion(): Promise<string> {
  const response = await fetch(
    `https://${SITE}/public/js/bundles/version.txt`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    fail(`The client version file returned HTTP ${response.status}.`);
  }
  const text = await response.text();
  return text.trim();
}

async function checkoutRevision(): Promise<string> {
  const text = await $`git rev-parse HEAD`
    .cwd(import.meta.dir)
    .quiet()
    .text();
  return text.trim();
}

/** Signs in and returns the account's user ID and the cookies that identify its session. */
async function signIn(
  version: string,
  validate: boolean,
): Promise<{ userId: number; cookie: string }> {
  const response = await fetch(`https://${SITE}/login`, {
    method: "POST",
    body: new URLSearchParams({
      username: ACCOUNT,
      password: ACCOUNT,
      newPassword: "",
      version,
    }),
  });
  if (!response.ok) {
    fail(
      `Signing in as "${ACCOUNT}" returned HTTP ${response.status}: ${await response.text()}`,
    );
  }
  const body = (await response.json()) as { userId?: unknown };
  if (validate) {
    const result = userRefSchema.safeParse(body);
    if (!result.success) {
      fail(
        `The server sent an invalid login response: ${result.error.message}`,
      );
    }
  }
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";", 1)[0])
    .join("; ");
  if (typeof body.userId !== "number" || cookie === "") {
    fail("Signing in did not return a user ID and a session cookie.");
  }
  return { userId: body.userId, cookie };
}

async function joinLobby(
  version: string,
  userId: number,
  cookie: string,
  validate: boolean,
) {
  const url = `wss://${SITE}/ws?account=${userId}&version=${encodeURIComponent(version)}`;
  const socket = new BunWebSocket(url, { headers: { Cookie: cookie } });
  const received = new Set<string>();
  const { promise, resolve, reject } = Promise.withResolvers<undefined>();
  const timer = setTimeout(() => {
    const missing = REQUIRED.filter((name) => !received.has(name));
    reject(
      new Error(
        `No ${missing.join(", ")} within ${TIMEOUT_MS / 1000} seconds.`,
      ),
    );
  }, TIMEOUT_MS);

  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") {
      return;
    }
    const message = unpackWsMessage(event.data);
    if (message === undefined) {
      reject(new Error("The server sent a message with no command."));
      return;
    }
    const [name, data] = message;
    if (name === "error" || name === "warning") {
      reject(new Error(`The server sent ${name}: ${JSON.stringify(data)}`));
      return;
    }
    if (validate) {
      const result = serverSchemas[name]?.safeParse(data);
      if (result?.success !== true) {
        reject(
          new Error(
            result === undefined
              ? `The server sent "${name}", which has no schema.`
              : `The server sent an invalid "${name}": ${result.error.message}`,
          ),
        );
        return;
      }
    }
    received.add(name);
    if (REQUIRED.every((required) => received.has(required))) {
      resolve(undefined);
    }
  });
  socket.addEventListener("close", (event) => {
    const reason = event.reason === "" ? "" : `: ${event.reason}`;
    reject(new Error(`The WebSocket closed (code ${event.code}${reason}).`));
  });

  try {
    await promise;
  } finally {
    clearTimeout(timer);
    socket.close();
  }
}

const version = await servedVersion();
const revision = await checkoutRevision();
const validate = version === revision;
if (!validate) {
  console.warn(
    `The site serves ${version}, but this checkout is at ${revision}, so payloads are not validated against its schemas.`,
  );
}
const { userId, cookie } = await signIn(version, validate);
try {
  await joinLobby(version, userId, cookie, validate);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
console.log(
  `Deployment check passed: "${ACCOUNT}" signed in and joined the lobby with client version ${version}${validate ? ", and every payload matched its schema" : ""}.`,
);
