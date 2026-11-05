import { SERVER_COMMAND_SCHEMAS } from "@hanabi-live/data";

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Shared test harness, not application code.
import { describe, expect } from "@jest/globals";
import { assertDefined } from "complete-common";
import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { promisify } from "node:util";

// eslint-disable-next-line import-x/no-extraneous-dependencies -- Reuse the test-only WebSocket client.
import { WebSocket } from "ws";
import { z } from "zod";
import type { evaluationDatabase } from "./experimental/evaluationSupport";
import { decodeSessionCookie } from "./sessionCookie";

export const ROOT = path.resolve(__dirname, "../../..");

export const databaseDescribe =
  process.env["HANABI_TEST_DATABASE_URL"] === undefined
    ? describe.skip
    : describe;

// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
export const run = promisify(execFile);

export const wireHistorySchema = SERVER_COMMAND_SCHEMAS.gameHistory
  .unwrap()
  .element.unwrap()
  .extend({
    datetimeStarted: z.coerce.date(),
    datetimeFinished: z.coerce.date(),
  })
  .readonly()
  .array()
  .readonly();

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
  send: (command: string, data: object) => void;
}

const rustProgressSnapshotSchema = z.object({
  game_id: z.number().int().positive(),
  game: z.object({
    turn: z.number().int().nonnegative(),
    activePlayerIndex: z.number().int().nonnegative(),
  }),
  clocks: z.number().array().readonly(),
});

const rustProgressPhaseSchema = z.discriminatedUnion("phase", [
  z.object({ phase: z.literal("pregame") }),
  z.object({ phase: z.literal("replay") }),
  z.object({ phase: z.literal("live"), snapshot: rustProgressSnapshotSchema }),
]);

export const rustProgressTableSchema = z.object({
  format: z.literal("hanabi-live-native-rust-2"),
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
  const distribution = path.join(directory, "packages/server/dist");
  await mkdir(path.dirname(distribution), { recursive: true });
  await cp(path.join(ROOT, "packages/server/dist"), distribution, {
    recursive: true,
  });
  await mkdir(path.join(directory, "public/js/bundles"), { recursive: true });
  await mkdir(path.join(directory, "public/img"), { recursive: true });
  await mkdir(path.join(directory, "install"), { recursive: true });
  await mkdir(path.join(directory, "misc"), { recursive: true });
  await Promise.all([
    symlink(
      path.join(ROOT, "node_modules"),
      path.join(directory, "node_modules"),
      "dir",
    ),
    symlink(
      path.join(ROOT, "install/migrations"),
      path.join(directory, "install/migrations"),
      "dir",
    ),
    symlink(
      path.join(ROOT, "misc/word_list.txt"),
      path.join(directory, "misc/word_list.txt"),
    ),
    symlink(
      path.join(ROOT, "public/img/favicon.ico"),
      path.join(directory, "public/img/favicon.ico"),
    ),
    writeFile(path.join(directory, "public/js/bundles/version.txt"), "1\n"),
  ]);
  const { connection } = database;
  const environment = {
    DOMAIN: domain,
    SESSION_SECRET: "synthetic-process-smoke-secret-".repeat(8),
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

export function startProcess(
  directory: string,
  goPort?: number,
  rust = false,
): ProcessState {
  let executable = process.execPath;
  if (rust) {
    executable = path.join(directory, "hanabi-rust-poc");
  } else if (goPort !== undefined) {
    executable = path.join(directory, "hanabi-live");
  }
  const child = spawn(
    executable,
    goPort === undefined && !rust ? ["packages/server/dist/main.js"] : [],
    {
      cwd: directory,
      env: {
        PATH: process.env["PATH"],
        HOME: directory,
        TMPDIR: directory,
        NODE_ENV: "test",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const ready = Promise.withResolvers<string>();
  let waiter: typeof ready | undefined = ready;
  let output = "";
  let lineBuffer = "";
  function collect(chunk: Buffer) {
    output = (output + chunk.toString()).slice(-32_768);
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split("\n");
    const unfinished = lines.pop();
    assertDefined(unfinished, "Missing partial process output.");
    lineBuffer = unfinished;
    for (const line of lines) {
      const address =
        goPort !== undefined && line.includes(`Listening on port ${goPort}.`)
          ? `http://127.0.0.1:${goPort}`
          : /Server listening at (http:\/\/127\.0\.0\.1:\d+)/u.exec(line)?.[1];
      if (address !== undefined) {
        waiter?.resolve(address);
        waiter = undefined;
      }
    }
  }
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.once("error", (error) => {
    waiter?.reject(error);
  });
  child.once("exit", (code, signal) => {
    waiter?.reject(
      new Error(`Compiled server exited (${code ?? signal}).\n${output}`),
    );
  });
  return {
    child,
    ready: ready.promise,
    output: () => output,
    async nextReady(): Promise<string> {
      if (waiter !== undefined) {
        throw new Error("A process readiness waiter is already registered.");
      }
      waiter = Promise.withResolvers<string>();
      return await waiter.promise;
    },
  };
}

export async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Missing ephemeral listener.");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
  return address.port;
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

/* eslint-disable no-await-in-loop -- Each lane must follow the actual client protocol in order. */
export async function buildRust(directory: string): Promise<void> {
  await cp(
    path.join(ROOT, "experimental/rust-server/target/release/hanabi-rust-poc"),
    path.join(directory, "hanabi-rust-poc"),
  );
}

export async function buildGo(directory: string): Promise<void> {
  for (const relative of [
    "packages/game/src/json",
    "packages/server/src/json",
    "server/src/views",
  ]) {
    await mkdir(path.dirname(path.join(directory, relative)), {
      recursive: true,
    });
    await symlink(
      path.join(ROOT, relative),
      path.join(directory, relative),
      "dir",
    );
  }
  await cp(
    path.join(ROOT, "dist/process-backends/hanabi-live"),
    path.join(directory, "hanabi-live"),
  );
}

/* eslint-enable no-await-in-loop */
export async function login(
  address: string,
  username: string,
): Promise<string> {
  const response = await fetch(`${address}/login`, {
    method: "POST",
    body: new URLSearchParams({
      username,
      password: "synthetic-smoke-password",
      version: "1",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.text();
  expect({ status: response.status, body }).toEqual({
    status: 200,
    body: "OK\n",
  });
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("hanabi.sid="))
    ?.split(";", 1)[0];
  assertDefined(cookie, "Login did not return a session cookie.");
  expect(
    decodeSessionCookie(
      cookie.slice("hanabi.sid=".length),
      "synthetic-process-smoke-secret-".repeat(8),
    ),
  ).toBeGreaterThan(0);
  return cookie;
}

export function socketClient(address: string, cookie: string): SocketClient {
  const socket = new WebSocket(`${address.replace("http:", "ws:")}/ws`, {
    headers: { Cookie: cookie },
    handshakeTimeout: 5000,
  });
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
      messages.push(raw.toString());
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
    send(command: string, data: object) {
      socket.send(`${command} ${JSON.stringify(data)}`);
    },
  };
}
