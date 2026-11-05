import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);

interface RedisRecord {
  readonly member: string;
  readonly revision: number;
  readonly payload: unknown;
}

interface RedisFixture {
  readonly url: string;
  command: (...args: readonly string[]) => Promise<unknown>;
  text: (...args: readonly string[]) => Promise<string>;
  kill: () => Promise<void>;
  restart: () => Promise<void>;
  close: () => Promise<void>;
  states: (namespace: string) => Promise<readonly RedisRecord[]>;
}

export async function redisFixture(): Promise<RedisFixture> {
  const directory = await mkdtemp(path.join(tmpdir(), "hanabi-redis-"));
  const socket = path.join(directory, "state.sock");
  let child: ChildProcess | undefined;
  const environment = {
    PATH: process.env["PATH"],
    LD_LIBRARY_PATH: process.env["LD_LIBRARY_PATH"],
    HOME: directory,
  };
  async function output(
    format: "--raw" | "--json",
    args: readonly string[],
  ): Promise<string> {
    const { stdout } = await run("redis-cli", ["-s", socket, format, ...args], {
      env: environment,
      timeout: 5000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return stdout;
  }

  async function command(...args: readonly string[]): Promise<unknown> {
    return JSON.parse(await output("--json", args)) as unknown;
  }

  async function text(...args: readonly string[]): Promise<string> {
    return await output("--raw", args);
  }

  async function kill() {
    if (
      child !== undefined
      && child.exitCode === null
      && child.signalCode === null
    ) {
      const closed = once(child, "close", {
        signal: AbortSignal.timeout(5000),
      });
      child.kill("SIGKILL");
      await closed;
    }
    child = undefined;
  }

  async function restart() {
    await kill();
    child = spawn(
      "redis-server",
      [
        "--port",
        "0",
        "--unixsocket",
        socket,
        "--unixsocketperm",
        "700",
        "--dir",
        directory,
        "--logfile",
        path.join(directory, "redis.log"),
        "--save",
        "",
        "--appendonly",
        "yes",
        "--appendfsync",
        "always",
        "--auto-aof-rewrite-percentage",
        "0",
      ],
      { env: environment, stdio: "ignore" },
    );
    const spawned = once(child, "spawn");
    await spawned;
    const deadline = performance.now() + 5000;
    let lastFailure: unknown;
    /* eslint-disable no-await-in-loop -- Poll only this owned child's readiness. */
    for (;;) {
      if (child.exitCode !== null || performance.now() >= deadline) {
        const log = await readFile(path.join(directory, "redis.log"), "utf8");
        throw new Error(`Redis fixture did not become ready.\n${log}`, {
          cause: lastFailure,
        });
      }
      try {
        if ((await command("PING")) === "PONG") {
          return;
        }
      } catch (error) {
        lastFailure = error;
      }
      await delay(10);
    }
    /* eslint-enable no-await-in-loop */
  }

  async function close() {
    try {
      await kill();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  try {
    await restart();
  } catch (error) {
    await close();
    throw error;
  }
  return {
    url: `redis+unix://${socket}`,
    command,
    text,
    kill,
    restart,
    close,
    async states(namespace: string): Promise<readonly RedisRecord[]> {
      // eslint-disable-next-line unicorn/prefer-uint8array-hex -- The project's TypeScript libraries do not expose toHex.
      const prefix = `hanabi:{${Buffer.from(namespace).toString("hex")}}`;
      const members = z
        .array(z.string())
        .parse(await command("SMEMBERS", `${prefix}:states`));
      return await Promise.all(
        members.toSorted().map(async (member) => {
          const record = z
            .tuple([z.string(), z.string()])
            .parse(
              await command(
                "HMGET",
                `${prefix}:state:${member}`,
                "revision",
                "payload",
              ),
            );
          const [revision, payload] = record;
          return {
            member,
            revision: z.coerce.number().int().nonnegative().parse(revision),
            payload:
              payload === "" ? undefined : (JSON.parse(payload) as unknown),
          };
        }),
      );
    },
  };
}
