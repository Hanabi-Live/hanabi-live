import type {
  CLIENT_REQUEST_SCHEMAS,
  ClientRequest,
  ReplyData,
  ServerEventData,
  UserId,
} from "@hanabi-live/data";
import { packRequest, unpackServerFrame, VERSION } from "@hanabi-live/data";

import { describe, expect } from "bun:test";
import { assertDefined } from "complete-common";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { WebSocket } from "ws";
import { z } from "zod";
import { decodeSessionCookie } from "./cookie.ts";
import type { evaluationDatabase } from "./database.ts";
import { serverFrameViolation } from "./serverFrames.ts";

export const ROOT = path.resolve(import.meta.dirname, "../../..");

/** The key that the test server signs session cookies with. */
const SESSION_SECRET = "synthetic-process-smoke-secret-".repeat(8);

/** Whether a "tableJoined" message enters a game or a replay, rather than a pregame. */
export function entersGame(joined: ServerEventData["tableJoined"]): boolean {
  return joined.stage !== "pregame";
}

/** The seat that the recipient of a "gameInitLoad" reply sees the game from, if any. */
export function ourPlayerIndex(
  init: ReplyData["gameInitLoad"],
): number | undefined {
  return "ourPlayerIndex" in init.mode ? init.mode.ourPlayerIndex : undefined;
}

export const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;

export interface CheckpointProgress {
  readonly game_id: number;
  readonly revision: number;
  readonly turn: number;
  readonly active_player_index: number;
  readonly clocks: readonly number[];
}

interface ProcessState {
  child: ChildProcess;
  ready: Promise<string>;
  output: () => string;
  nextReady: () => Promise<string>;
}

interface SocketClient {
  socket: WebSocket;
  receive: <T>(
    command: string,
    schema: z.ZodType<T>,
    accept?: (data: T) => boolean,
  ) => Promise<T>;
  /** Sends a request. A later `receive` fails if the server refuses it. */
  send: <Command extends ClientRequest>(
    command: Command,
    data: z.input<(typeof CLIENT_REQUEST_SCHEMAS)[Command]>,
  ) => void;
  /**
   * Sends a request and waits for its reply, which comes after every message that the request's
   * work sent. Fails if the server refuses it.
   */
  request: <Command extends ClientRequest>(
    command: Command,
    data: z.input<(typeof CLIENT_REQUEST_SCHEMAS)[Command]>,
  ) => Promise<ReplyData[Command]>;
  /** Sends a request that the server must refuse, and returns the refusal. */
  refused: <Command extends ClientRequest>(
    command: Command,
    data: z.input<(typeof CLIENT_REQUEST_SCHEMAS)[Command]>,
  ) => Promise<ServerEventData["warning"]>;
}

const rustProgressSnapshotSchema = z.object({
  game_id: z.number().int().positive(),
  players: z.unknown().array().readonly(),
  // Checkpoints store a game as the steps that the engine replays.
  game: z.object({ steps: z.unknown().array().readonly() }),
  clocks: z.number().array().readonly(),
});

const rustProgressPhaseSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("pregame") }),
  z.object({ phase: z.literal("replay") }),
  z.object({ phase: z.literal("live"), snapshot: rustProgressSnapshotSchema }),
]);

export const rustProgressTableSchema = z.object({
  format: z.literal("hanabi-live-20"),
  phase: rustProgressPhaseSchema,
});

export async function bounded<T>(
  promise: Promise<T>,
  description: string,
  milliseconds = 10_000,
): Promise<T> {
  const timeout = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    timeout.reject(new Error(`Timed out: ${description}`));
  }, milliseconds);
  try {
    return await Promise.race([promise, timeout.promise]);
  } finally {
    clearTimeout(timer);
  }
}

export async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const closed = once(child, "close");
  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
  }, 3000);
  try {
    await bounded(closed, "compiled process shutdown", 5000);
  } finally {
    clearTimeout(timer);
  }
}

export async function prepareRoot(
  directory: string,
  database: Awaited<ReturnType<typeof evaluationDatabase>>,
  domain: string,
): Promise<void> {
  await mkdir(path.join(directory, "public/js/bundles"), { recursive: true });
  await mkdir(path.join(directory, "public/img"), { recursive: true });
  await Promise.all([
    symlink(
      path.join(ROOT, "public/img/favicon.ico"),
      path.join(directory, "public/img/favicon.ico"),
    ),
    writeFile(
      path.join(directory, "public/js/bundles/version.txt"),
      `${VERSION}\n`,
    ),
  ]);
  const { connection } = database;
  const environment = {
    DOMAIN: domain,
    SESSION_SECRET,
    PORT: "0",
    LOCALHOST_PORT: "0",
    DB_HOST: connection.host,
    DB_PORT: String(connection.port),
    DB_USER: connection.username,
    DB_PASSWORD:
      connection.password === ""
        ? "unused-local-trust-password"
        : connection.password,
    DB_NAME: connection.database,
  };
  const contents = Object.entries(environment)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n");
  await writeFile(path.join(directory, ".env"), `${contents}\n`);
}

export function startProcess(directory: string): ProcessState {
  const executable = path.join(directory, "hanabi-live");
  const child = spawn(executable, [], {
    cwd: directory,
    env: {
      PATH: process.env["PATH"],
      HOME: directory,
      TMPDIR: directory,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ready = Promise.withResolvers<string>();
  let waiter: typeof ready | undefined = ready;
  let output = "";
  let publicAddress: string | undefined;
  let operationsReady = false;
  const lineBuffers = { stdout: "", stderr: "" };
  function getOutput() {
    return `${output}${lineBuffers.stdout}${lineBuffers.stderr}`.slice(-32_768);
  }

  function collect(stream: "stdout" | "stderr", chunk: Buffer) {
    lineBuffers[stream] += chunk.toString();
    const lines = lineBuffers[stream].split("\n");
    const unfinished = lines.pop();
    assertDefined(unfinished, "Missing partial process output.");
    lineBuffers[stream] = unfinished;
    for (const line of lines) {
      output = `${output}${line}\n`.slice(-32_768);
      const address = /Server listening at (http:\/\/127\.0\.0\.1:\d+)/u.exec(
        line,
      )?.[1];
      if (address !== undefined) {
        publicAddress = address;
      }
      if (
        /Localhost operations listening at http:\/\/127\.0\.0\.1:\d+/u.test(
          line,
        )
      ) {
        operationsReady = true;
      }
      if (publicAddress !== undefined && operationsReady) {
        waiter?.resolve(publicAddress);
        waiter = undefined;
      }
    }
  }
  child.stdout.on("data", (chunk: Buffer) => {
    collect("stdout", chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => {
    collect("stderr", chunk);
  });
  child.once("error", (error) => {
    waiter?.reject(error);
  });
  child.once("exit", (code, signal) => {
    waiter?.reject(
      new Error(`Compiled server exited (${code ?? signal}).\n${getOutput()}`),
    );
  });
  return {
    child,
    ready: ready.promise,
    output: getOutput,
    async nextReady(): Promise<string> {
      if (waiter !== undefined) {
        throw new Error("A process readiness waiter is already registered.");
      }
      publicAddress = undefined;
      operationsReady = false;
      waiter = Promise.withResolvers<string>();
      return await waiter.promise;
    },
  };
}

export function summary(values: readonly number[]): {
  count: number;
  p50Milliseconds: number | undefined;
  p95Milliseconds: number | undefined;
  maxMilliseconds: number | undefined;
} {
  const sorted = values.toSorted((a, b) => a - b);
  return {
    count: sorted.length,
    p50Milliseconds: sorted[Math.floor(sorted.length * 0.5)],
    p95Milliseconds: sorted[Math.floor(sorted.length * 0.95)],
    maxMilliseconds: sorted.at(-1),
  };
}

export async function settleLanes(
  tasks: ReadonlyArray<Promise<void>>,
): Promise<void> {
  const results = await Promise.allSettled(tasks);
  const failures = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason as unknown] : [],
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, "Evaluation lanes failed.");
  }
}

export async function buildRust(directory: string): Promise<void> {
  await cp(
    path.join(ROOT, "server/target/debug/hanabi-live"),
    path.join(directory, "hanabi-live"),
  );
}

/** Installs the schema into the empty test database, as a new installation does. */
export async function installSchema(directory: string): Promise<void> {
  const child = spawn(
    path.join(directory, "hanabi-live"),
    ["migrate", "apply"],
    {
      cwd: directory,
      env: { PATH: process.env["PATH"], HOME: directory, TMPDIR: directory },
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
  await once(child, "exit");
  expect(child.exitCode).toBe(0);
}

export async function login(
  address: string,
  username: string,
  bot = false,
): Promise<string> {
  const response = await fetch(`${address}/login`, {
    method: "POST",
    body: new URLSearchParams({
      username,
      password: "synthetic-smoke-password",
      ...(bot ? { client: "bot" } : { version: VERSION }),
      createAccount: "true",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("hanabi.sid="))
    ?.split(";", 1)[0];
  assertDefined(cookie, "Login did not return a session cookie.");
  expect(body).toEqual({ userId: cookieUserId(cookie), username });
  return cookie;
}

/** The user whom a session cookie from `login` signs in. */
export function cookieUserId(cookie: string): UserId {
  const userId = decodeSessionCookie(
    cookie.slice("hanabi.sid=".length),
    SESSION_SECRET,
  );
  assertDefined(userId, "The session cookie is not valid.");
  return userId;
}

export function socketClient(address: string, cookie: string): SocketClient {
  const socket = new WebSocket(
    `${address.replace("http:", "ws:")}/ws?version=${encodeURIComponent(VERSION)}`,
    {
      headers: { Cookie: cookie },
      handshakeTimeout: 5000,
    },
  );
  /** The messages that the server sent on its own and that no `receive` took yet. */
  const events: Array<{ readonly name: string; readonly data: unknown }> = [];
  /** The replies that no `request` took yet, by request ID. */
  const replies = new Map<
    number,
    { readonly data: unknown; readonly error: unknown }
  >();
  /** The command of each request that the server has not answered, by request ID. */
  const commands = new Map<number, ClientRequest>();
  /** The requests sent with `send` that the server refused. */
  const refusals: string[] = [];
  const awaited = new Set<number>();
  let nextRequestId = 1;
  let changed = Promise.withResolvers<undefined>();
  let failure: Error | undefined;
  function wake() {
    const previous = changed;
    changed = Promise.withResolvers<undefined>();
    previous.resolve(undefined);
  }
  socket.on("message", (raw) => {
    if (Buffer.isBuffer(raw)) {
      const message = raw.toString();
      const violation = serverFrameViolation(message, (id) => commands.get(id));
      const frame = unpackServerFrame(message);
      if (violation !== undefined || frame === undefined) {
        failure ??= new Error(violation);
      } else if (frame.kind === "event") {
        events.push(frame);
      } else {
        commands.delete(frame.id);
        if (awaited.has(frame.id)) {
          replies.set(frame.id, frame);
        } else if (
          frame.error !== undefined
          && !(
            typeof frame.error === "object"
            && frame.error !== null
            && "code" in frame.error
            && frame.error.code === "commandIgnored"
          )
        ) {
          refusals.push(message);
        }
      }
    } else {
      failure = new Error("Expected a text WebSocket frame.");
    }
    wake();
  });
  socket.on("error", (error) => {
    failure = error;
    wake();
  });
  socket.on("close", () => {
    failure ??= new Error("WebSocket closed before expected message.");
    wake();
  });

  /** Throws if the connection failed, or if the server refused a request or sent an error. */
  function checkFailures() {
    if (failure !== undefined) {
      throw failure;
    }
    const rejection = events.find(
      (event) => event.name === "error" || event.name === "warning",
    );
    if (rejection !== undefined) {
      throw new Error(
        `Unexpected server ${rejection.name}: ${JSON.stringify(rejection.data)}`,
      );
    }
    const [refusal] = refusals;
    if (refusal !== undefined) {
      throw new Error(`Unexpected refused request: ${refusal}`);
    }
  }

  async function receive<T>(
    command: string,
    schema: z.ZodType<T>,
    accept: (data: T) => boolean = () => true,
  ): Promise<T> {
    return await bounded(
      (async () => {
        for (;;) {
          const index = events.findIndex((event) => event.name === command);
          if (index !== -1) {
            const [event] = events.splice(index, 1);
            assertDefined(event, "Missing queued WebSocket message.");
            const parsed = schema.parse(event.data);
            if (accept(parsed)) {
              return parsed;
            }
            continue;
          }
          checkFailures();
          // eslint-disable-next-line no-await-in-loop
          await changed.promise;
        }
      })(),
      `WebSocket ${command}`,
    );
  }

  function send<Command extends ClientRequest>(
    command: Command,
    data: z.input<(typeof CLIENT_REQUEST_SCHEMAS)[Command]>,
  ): number {
    const id = nextRequestId;
    nextRequestId++;
    commands.set(id, command);
    socket.send(packRequest(id, command, data));
    return id;
  }

  /** Sends a request and waits for its reply. */
  async function answer<Command extends ClientRequest>(
    command: Command,
    data: z.input<(typeof CLIENT_REQUEST_SCHEMAS)[Command]>,
  ) {
    const id = nextRequestId;
    awaited.add(id);
    send(command, data);
    return await bounded(
      (async () => {
        for (;;) {
          const reply = replies.get(id);
          if (reply !== undefined) {
            replies.delete(id);
            awaited.delete(id);
            return reply;
          }
          if (failure !== undefined) {
            throw failure;
          }
          // eslint-disable-next-line no-await-in-loop
          await changed.promise;
        }
      })(),
      `WebSocket reply to ${command}`,
    );
  }

  async function request<Command extends ClientRequest>(
    command: Command,
    data: z.input<(typeof CLIENT_REQUEST_SCHEMAS)[Command]>,
  ): Promise<ReplyData[Command]> {
    const reply = await answer(command, data);
    if (reply.error !== undefined) {
      throw new Error(
        `The server refused ${command}: ${JSON.stringify(reply.error)}`,
      );
    }
    // `serverFrameViolation` checked the data against the reply's schema.
    return reply.data as ReplyData[Command];
  }

  async function refused<Command extends ClientRequest>(
    command: Command,
    data: z.input<(typeof CLIENT_REQUEST_SCHEMAS)[Command]>,
  ): Promise<ServerEventData["warning"]> {
    const reply = await answer(command, data);
    if (reply.error === undefined) {
      throw new Error(`The server did not refuse ${command}.`);
    }
    // `serverFrameViolation` checked the failure against the notice's schema.
    return reply.error as ServerEventData["warning"];
  }

  return {
    socket,
    receive,
    send(command, data) {
      send(command, data);
    },
    request,
    refused,
  };
}
