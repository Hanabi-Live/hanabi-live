/**
 * Runs the repository's test suites. The integration suites need PostgreSQL, so this starts a
 * disposable server unless `HANABI_TEST_DATABASE_URL` already names one (as in CI), instead of
 * letting those suites skip.
 */

import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import postgres from "postgres";

const ROOT = path.resolve(__dirname, "../../..");
// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);

// The client's tests run with Vitest from the root "test" script.
const TEST_DIRECTORIES = ["packages/game/src", "packages/testing/src"] as const;

const MISSING_POSTGRES =
  'The integration tests need PostgreSQL. Put the PostgreSQL server programs ("initdb" and "postgres") on your PATH, or set HANABI_TEST_DATABASE_URL to a disposable local server.';

const MISSING_REDIS =
  'The integration tests need Redis. Put the Redis server program ("redis-server", version 7.2 or newer) on your PATH.';

async function isExecutable(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function pathDirectories(): readonly string[] {
  return (process.env["PATH"] ?? "")
    .split(path.delimiter)
    .filter((directory) => directory !== "");
}

/** Fails before the slow server build when the Redis fixture cannot start. */
async function checkRedis() {
  const found = await Promise.all(
    pathDirectories().map(
      async (directory) =>
        await isExecutable(path.join(directory, "redis-server")),
    ),
  );
  if (!found.includes(true)) {
    throw new Error(MISSING_REDIS);
  }
}

/** Finds the directory holding "initdb" and "postgres". */
async function postgresDirectory(): Promise<string> {
  const candidates = [...pathDirectories()];
  try {
    const { stdout } = await run("pg_config", ["--bindir"]);
    candidates.push(stdout.trim());
  } catch {
    // "pg_config" is optional.
  }

  // Debian and Ubuntu keep the server programs off the PATH.
  try {
    const versions = await readdir("/usr/lib/postgresql");
    versions.sort((a, b) => Number(b) - Number(a));
    candidates.push(
      ...versions.map((version) =>
        path.join("/usr/lib/postgresql", version, "bin"),
      ),
    );
  } catch {
    // This layout is optional.
  }

  for (const directory of candidates) {
    // eslint-disable-next-line no-await-in-loop -- Check the candidates in order of preference.
    const found = await Promise.all(
      ["initdb", "postgres"].map(
        async (program) => await isExecutable(path.join(directory, program)),
      ),
    );
    if (found.every(Boolean)) {
      return directory;
    }
  }

  throw new Error(MISSING_POSTGRES);
}

async function freePort(): Promise<number> {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  listener.close();
  await once(listener, "close");
  if (address === null || typeof address === "string") {
    throw new Error("Failed to reserve a port for PostgreSQL.");
  }
  return address.port;
}

interface DisposablePostgres {
  readonly url: string;
  readonly stop: () => Promise<void>;
}

async function startPostgres(): Promise<DisposablePostgres> {
  const binaries = await postgresDirectory();
  const directory = await mkdtemp(path.join(tmpdir(), "hanabi-postgres-"));
  const data = path.join(directory, "data");
  let child: ChildProcess | undefined;

  async function stop() {
    if (
      child !== undefined
      && child.exitCode === null
      && child.signalCode === null
    ) {
      const closed = once(child, "close");
      // SIGINT is PostgreSQL's fast shutdown.
      child.kill("SIGINT");
      await closed;
    }
    await rm(directory, { recursive: true, force: true });
  }

  try {
    await run(
      path.join(binaries, "initdb"),
      ["-D", data, "--username", "postgres", "--auth", "trust", "--no-sync"],
      { timeout: 60_000 },
    );
    const port = await freePort();
    child = spawn(
      path.join(binaries, "postgres"),
      [
        "-D",
        data,
        "-p",
        port.toString(),
        "-c",
        "listen_addresses=127.0.0.1",
        "-c",
        "unix_socket_directories=",
        "-c",
        "fsync=off",
      ],
      { stdio: "ignore" },
    );
    await once(child, "spawn");

    const url = `postgres://postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
    const deadline = performance.now() + 30_000;
    /* eslint-disable no-await-in-loop -- Poll only this owned child's readiness. */
    for (;;) {
      if (child.exitCode !== null) {
        throw new Error("PostgreSQL exited before accepting connections.");
      }
      const sql = postgres(url, {
        max: 1,
        connect_timeout: 1,
        onnotice: () => undefined,
      });
      try {
        await sql`SELECT 1`;
        break;
      } catch (error) {
        if (performance.now() >= deadline) {
          throw new Error("PostgreSQL did not accept connections.", {
            cause: error,
          });
        }
      } finally {
        await sql.end();
      }
      await delay(100);
    }
    /* eslint-enable no-await-in-loop */

    return { url, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

async function buildServer() {
  const started = performance.now();
  // The server rejects clients from another revision, so pair the tests' client version with the
  // revision the server is built from.
  await run("bash", [path.join(ROOT, "scripts/dev/set-version.sh")]);
  await run("cargo", ["build", "--release", "--locked"], {
    cwd: path.join(ROOT, "server"),
    timeout: 300_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  // The catalog test compares the variants that the rules derive with the game library's.
  await run(
    "cargo",
    ["build", "--locked", "--package", "hanabi_engine", "--example", "catalog"],
    {
      cwd: path.join(ROOT, "server"),
      timeout: 300_000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  console.info(
    `Process server built in ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
}

/** Runs a command with its output shown, and returns its exit code. */
async function runInherited(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly env: NodeJS.ProcessEnv },
): Promise<number> {
  const child = spawn(command, args, { ...options, stdio: "inherit" });
  const [code, signal] = (await once(child, "close")) as [
    number | null,
    NodeJS.Signals | null,
  ];
  return code ?? (signal === null ? 1 : 128);
}

/** The suites this runner can run. Turborepo caches each one separately. */
const SUITES = ["rust", "bun", "critical-css"] as const;
type Suite = (typeof SUITES)[number];

function isSuite(value: string | undefined): value is Suite {
  return SUITES.includes(value as Suite);
}

async function runSuite(
  suite: Suite,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  switch (suite) {
    case "rust": {
      return await runInherited(
        "cargo",
        ["test", "--locked", "--workspace", ...args],
        { cwd: path.join(ROOT, "server"), env },
      );
    }

    case "bun": {
      await buildServer();
      return await runInherited(
        process.execPath,
        [
          "test",
          "--parallel=4",
          "--isolate",
          "--tsconfig-override",
          "tsconfig.monorepo.json",
          ...TEST_DIRECTORIES,
          ...args,
        ],
        { cwd: ROOT, env },
      );
    }

    case "critical-css": {
      await buildServer();
      return await runInherited(
        process.execPath,
        [
          "--tsconfig-override",
          "tsconfig.monorepo.json",
          "packages/testing/src/criticalCSS.ts",
          ...args,
        ],
        { cwd: ROOT, env },
      );
    }
  }
}

async function main(): Promise<number> {
  const [suite, ...args] = process.argv.slice(2);
  if (!isSuite(suite)) {
    throw new Error(`The first argument must be one of: ${SUITES.join(", ")}`);
  }
  await checkRedis();
  let database: DisposablePostgres | undefined;
  let url = process.env["HANABI_TEST_DATABASE_URL"];
  if (url === undefined) {
    database = await startPostgres();
    ({ url } = database);
  }

  try {
    return await runSuite(suite, args, {
      ...process.env,
      HANABI_TEST_DATABASE_URL: url,
    });
  } finally {
    await database?.stop();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    console.error("Failed to run the tests:", error);
    process.exitCode = 1;
  });
