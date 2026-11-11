import type {
  CLIENT_COMMAND_SCHEMAS,
  ClientCommand,
  ServerCommandData,
  UserId,
} from "@hanabi-live/data";
import { VERSION } from "@hanabi-live/data";

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

/** The seat that an "init" message's recipient sees the game from, if any. */
export function ourPlayerIndex(
  init: ServerCommandData["init"],
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
  send: <Command extends ClientCommand>(
    command: Command,
    data: z.input<(typeof CLIENT_COMMAND_SCHEMAS)[Command]>,
  ) => void;
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
  format: z.literal("hanabi-live-12"),
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
    path.join(ROOT, "server/target/release/hanabi-live"),
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
  expect(body).toEqual({ userId: cookieUserId(cookie) });
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
  const messages: string[] = [];
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
      const violation = serverFrameViolation(message);
      if (violation === undefined) {
        messages.push(message);
      } else {
        failure ??= new Error(violation);
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

  async function receive<T>(
    command: string,
    schema: z.ZodType<T>,
    accept: (data: T) => boolean = () => true,
  ): Promise<T> {
    return await bounded(
      (async () => {
        for (;;) {
          const index = messages.findIndex((message) =>
            message.startsWith(`${command} `),
          );
          if (index !== -1) {
            const [message] = messages.splice(index, 1);
            assertDefined(message, "Missing queued WebSocket message.");
            const data: unknown = JSON.parse(message.slice(command.length + 1));
            const parsed = schema.parse(data);
            if (accept(parsed)) {
              return parsed;
            }
            continue;
          }
          if (failure !== undefined) {
            throw failure;
          }
          const rejection = messages.find((message) =>
            /^(?:error|warning) /u.test(message),
          );
          if (rejection !== undefined) {
            throw new Error(`Unexpected server rejection: ${rejection}`);
          }
          // eslint-disable-next-line no-await-in-loop
          await changed.promise;
        }
      })(),
      `WebSocket ${command}`,
    );
  }
  return {
    socket,
    receive,
    send(command, data) {
      socket.send(`${command} ${JSON.stringify(data)}`);
    },
  };
}
