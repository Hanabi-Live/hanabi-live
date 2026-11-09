// Checks the live site the way a returning player reaches it after a deployment: it signs in a
// shared test account over HTTPS, then opens a WebSocket with the client version that the site
// serves, and waits for the lobby's first messages. It exits with an error if any step fails. The
// deployed revision can differ from this checkout, so this does not validate payloads against this
// checkout's schemas; the integration tests cover the payloads.

const SITE = "hanab.live";
/** A shared test account; connecting replaces any other session that it has. */
const ACCOUNT = "test3";
const TIMEOUT_MS = 30_000;
/** The messages that every new connection receives before it can use the lobby. */
const REQUIRED = ["welcome", "userList", "tableList"] as const;

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

/** Signs in and returns the account's user ID and the cookies that identify its session. */
async function signIn(
  version: string,
): Promise<{ userID: number; cookie: string }> {
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
  const body = (await response.json()) as { userID?: unknown };
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(";", 1)[0])
    .join("; ");
  if (typeof body.userID !== "number" || cookie === "") {
    fail("Signing in did not return a user ID and a session cookie.");
  }
  return { userID: body.userID, cookie };
}

async function joinLobby(version: string, userID: number, cookie: string) {
  const url = `wss://${SITE}/ws?account=${userID}&version=${encodeURIComponent(version)}`;
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
    // Each message is the command's name, a space, and its JSON payload.
    const [name = "", ...rest] = event.data.split(" ");
    if (name === "error" || name === "warning") {
      reject(new Error(`The server sent ${name}: ${rest.join(" ")}`));
      return;
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
const { userID, cookie } = await signIn(version);
try {
  await joinLobby(version, userID, cookie);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
console.log(
  `Deployment check passed: "${ACCOUNT}" signed in and joined the lobby with client version ${version}.`,
);
