// Runs Hanab Live for local development:
// - PostgreSQL in a container (see "compose.yml"), with the schema loaded on first use.
// - The server, rebuilt and restarted whenever its sources or the checked-out commit change.
// - The client from Vite's development server, which reloads the page when the client changes.
// - A watch build of the scripts of the standalone pages. "bun run dev down" stops the containers;
//   their data is kept.

import type { Subprocess } from "bun";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  watch,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../../..");
const SERVER_DIR = path.join(ROOT, "server");
const SERVER_BINARY = path.join(SERVER_DIR, "target/debug/hanabi-live");
const ENV_PATH = path.join(ROOT, ".env");
/** Changes to these paths rebuild and restart the server. */
const SERVER_SOURCES = [
  "src",
  "engine/src",
  "protocol/src",
  "templates",
  "build.rs",
  "Cargo.toml",
  "Cargo.lock",
] as const;
const DEV_PORT = "1212";
/** How often to check for a new commit, which changes the revision compiled into the server. */
const HEAD_POLL_MS = 1000;

type Label = "build" | "client" | "dev" | "standalone" | "server" | "services";

function log(label: Label, line: string) {
  console.log(`[${label}] ${line}`);
}

function fail(message: string): never {
  log("dev", message);
  process.exit(1);
}

/** Runs a task in the background, reporting an unexpected failure. */
function background(promise: Promise<unknown>) {
  promise.catch((error: unknown) => {
    console.error(error);
  });
}

/** Reads a value from ".env", treating an empty value as unset. */
function setting(
  env: ReadonlyMap<string, string>,
  name: string,
  fallback: string,
): string {
  const value = env.get(name);
  return value === undefined || value === "" ? fallback : value;
}

/** Forwards a child process's output line by line, labelled with its source. */
async function forward(label: Label, stream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  let pending = "";
  for await (const chunk of stream) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      log(label, line);
    }
  }
  if (pending !== "") {
    log(label, pending);
  }
}

function start(
  label: Label,
  command: readonly string[],
  cwd = ROOT,
): Subprocess<"ignore", "pipe", "pipe"> {
  const child = Bun.spawn([...command], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  background(forward(label, child.stdout));
  background(forward(label, child.stderr));
  return child;
}

async function run(
  label: Label,
  command: readonly string[],
  options: {
    readonly cwd?: string;
    readonly quiet?: boolean;
  } = {},
): Promise<{ ok: boolean; output: string; errors: string }> {
  const child = Bun.spawn([...command], {
    cwd: options.cwd ?? ROOT,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [output, errors, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0 && options.quiet !== true && errors.trim() !== "") {
    for (const line of errors.trim().split("\n")) {
      log(label, line);
    }
  }
  return { ok: code === 0, output: output.trim(), errors: errors.trim() };
}

/** The first run creates ".env" with a random session secret and a port that needs no root. */
function ensureEnv(): ReadonlyMap<string, string> {
  if (!existsSync(ENV_PATH)) {
    const template = readFileSync(path.join(ROOT, ".env.example"), "utf8");
    const secret = crypto.getRandomValues(new Uint8Array(64)).toHex();
    writeFileSync(
      ENV_PATH,
      template
        .replace(/^SESSION_SECRET=""$/mu, `SESSION_SECRET="${secret}"`)
        .replace(/^PORT=""$/mu, `PORT="${DEV_PORT}"`),
    );
    log("dev", 'Created ".env" for local development.');
  }
  const values = new Map<string, string>();
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const match = /^([A-Z_]+)="?(.*?)"?$/u.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values.set(match[1], match[2]);
    }
  }
  return values;
}

function composeCommand(): readonly string[] {
  const file = path.join(ROOT, "compose.yml");
  if (Bun.which("podman") !== null) {
    return ["podman", "compose", "--file", file];
  }
  if (Bun.which("docker") !== null) {
    return ["docker", "compose", "--file", file];
  }
  return fail("Podman or Docker is required to run PostgreSQL.");
}

/** Runs psql in the PostgreSQL container, as the configured user and database. */
function psqlCommand(env: ReadonlyMap<string, string>): readonly string[] {
  const user = setting(env, "DB_USER", "hanabiuser");
  const database = setting(env, "DB_NAME", "hanabi");
  return [
    ...composeCommand(),
    "exec",
    "-T",
    "postgres",
    "psql",
    "--quiet",
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    `--username=${user}`,
    `--dbname=${database}`,
  ];
}

/**
 * Every checkout shares one PostgreSQL volume, so a migration that another checkout applied can
 * differ from this checkout's file with the same number, and a database that an old checkout
 * created can be older than this checkout's migration baseline.
 */
function explainReset(env: ReadonlyMap<string, string>, reason: string) {
  const user = setting(env, "DB_USER", "hanabiuser");
  const database = setting(env, "DB_NAME", "hanabi");
  const [composeTool] = composeCommand();
  log("dev", `All checkouts share one database. ${reason}`);
  log("dev", "To reset the database and lose its data, run:");
  log(
    "dev",
    `  ${composeTool} compose exec -T postgres psql -U ${user} -d postgres -c "DROP DATABASE ${database} WITH (FORCE)" -c "CREATE DATABASE ${database}"`,
  );
}

async function startServices(env: ReadonlyMap<string, string>) {
  const compose = composeCommand();
  log("services", "Starting PostgreSQL...");
  const up = await run("services", [...compose, "up", "--detach"]);
  if (!up.ok) {
    fail("Could not start the container. Is something else using port 5432?");
  }
  const psql = psqlCommand(env);
  for (let attempt = 0; ; attempt++) {
    // eslint-disable-next-line no-await-in-loop -- Each check waits for the previous one.
    const postgres = await run(
      "services",
      [...psql, "--tuples-only", "--command=SELECT 1"],
      { quiet: true },
    );
    if (postgres.ok) {
      break;
    }
    if (attempt === 60) {
      fail("PostgreSQL did not become ready within a minute.");
    }
    // eslint-disable-next-line no-await-in-loop -- Each check waits for the previous one.
    await Bun.sleep(1000);
  }
  log("services", "PostgreSQL is ready.");
}

/** The server refuses client assets from another revision, so both clients follow the server. */
function writeVersion(revision: string) {
  const bundles = path.join(ROOT, "public/js/bundles");
  mkdirSync(bundles, { recursive: true });
  writeFileSync(path.join(bundles, "version.txt"), `${revision}\n`);
  writeFileSync(
    path.join(ROOT, "packages/data/src/version.js"),
    `// @ts-nocheck\n\nexport const VERSION = "${revision}";\n`,
  );
}

async function buildServer(): Promise<string | undefined> {
  log("build", "Building the server...");
  const build = Bun.spawn(["cargo", "build", "--locked"], {
    cwd: SERVER_DIR,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  await Promise.all([
    forward("build", build.stdout),
    forward("build", build.stderr),
  ]);
  if ((await build.exited) !== 0) {
    log("build", "The build failed; the previous server keeps running.");
    return undefined;
  }
  const version = await run("build", [SERVER_BINARY, "--version"]);
  return version.ok ? version.output : undefined;
}

type Child = Subprocess<"ignore", "pipe", "pipe">;

let server: Child | undefined;
let client: Child | undefined;
let standalone: Child | undefined;
let revision: string | undefined;
let stopping = false;
let building = false;
let rebuildQueued = false;

async function stopServer() {
  const child = server;
  if (child !== undefined) {
    server = undefined;
    // The server drains gracefully on SIGTERM; live games survive in PostgreSQL.
    child.kill("SIGTERM");
    await child.exited;
  }
}

function startServer() {
  const child = start("server", [SERVER_BINARY]);
  server = child;
  background(
    child.exited.then((code) => {
      if (!stopping && server === child) {
        server = undefined;
        log(
          "server",
          `Exited with code ${code}; it restarts after the next change.`,
        );
      }
    }),
  );
}

async function rebuild() {
  const built = await buildServer();
  if (built === undefined) {
    return;
  }
  await stopServer();
  if (built !== revision) {
    // A commit changes the revision compiled into the server.
    revision = built;
    writeVersion(built);
  }
  startServer();
}

/** Rebuilds until no change arrived during the previous build. */
async function rebuildWhileQueued() {
  building = true;
  while (rebuildQueued) {
    rebuildQueued = false;
    // eslint-disable-next-line no-await-in-loop -- Builds must not overlap.
    await rebuild();
  }
  building = false;
}

function watchServerSources() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function trigger() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      rebuildQueued = true;
      if (!building) {
        background(rebuildWhileQueued());
      }
    }, 300);
  }
  for (const source of SERVER_SOURCES) {
    watch(path.join(SERVER_DIR, source), { recursive: true }, trigger);
  }
  // Linting a commit writes its revision into the client, which the old server then rejects. Git
  // replaces its ref files rather than writing them, so poll instead of watching them.
  let head: string | undefined;
  setInterval(() => {
    background(
      run("dev", ["git", "rev-parse", "HEAD"], { quiet: true }).then(
        (result) => {
          if (!result.ok) {
            return;
          }
          if (head !== undefined && result.output !== head) {
            log("dev", "The commit changed; rebuilding the server.");
            trigger();
          }
          head = result.output;
        },
      ),
    );
  }, HEAD_POLL_MS);
}

async function shutDown(code: number) {
  if (stopping) {
    return;
  }
  stopping = true;
  log("dev", "Stopping...");
  client?.kill();
  standalone?.kill();
  await stopServer();
  process.exit(code);
}

function stopWhenExited(label: Label, child: Child) {
  background(
    child.exited.then(async (code) => {
      if (!stopping) {
        log(label, `Exited with code ${code}.`);
        await shutDown(1);
      }
    }),
  );
}

async function main() {
  if (process.argv[2] === "down") {
    const down = await run("services", [...composeCommand(), "down"]);
    process.exit(down.ok ? 0 : 1);
  }
  process.on("SIGINT", () => {
    background(shutDown(0));
  });
  process.on("SIGTERM", () => {
    background(shutDown(0));
  });

  const env = ensureEnv();
  await startServices(env);
  revision = await buildServer();
  if (revision === undefined) {
    fail("Fix the build error, then run this again.");
  }
  writeVersion(revision);
  // This installs the schema into a new database and applies pending migrations.
  const migrated = await run("services", [SERVER_BINARY, "migrate", "apply"]);
  if (!migrated.ok) {
    if (migrated.errors.includes("previously applied but has been modified")) {
      explainReset(
        env,
        "Another checkout applied a different version of this migration.",
      );
    } else if (migrated.errors.includes("older than baseline")) {
      explainReset(env, "It is too old for this checkout to migrate.");
    }
    fail("Could not migrate the database.");
  }
  for (const line of migrated.output.trim().split("\n")) {
    log("services", line);
  }

  client = start(
    "client",
    ["bunx", "--bun", "--no-install", "vite"],
    path.join(ROOT, "packages/client"),
  );
  standalone = start("standalone", [
    "bash",
    "scripts/dev/build-standalone.sh",
    "--watch=forever",
  ]);
  startServer();
  watchServerSources();
  log("dev", `Ready: http://localhost:${setting(env, "PORT", DEV_PORT)}/`);

  // A client watcher that stops is unexpected, so stop everything rather than serve stale code.
  stopWhenExited("client", client);
  stopWhenExited("standalone", standalone);
}

await main();
