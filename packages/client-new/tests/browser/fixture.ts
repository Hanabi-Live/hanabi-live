// cspell:words framesent
import type { Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
// eslint-disable-next-line import-x/no-relative-packages -- Reuse the repository's disposable integration fixtures without a production export.
import { evaluationDatabase } from "../../../server/src/experimental/evaluationSupport";
// eslint-disable-next-line import-x/no-relative-packages -- This is test-only process ownership and cleanup.
import { redisFixture } from "../../../server/src/experimental/redisFixture";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores execFile's ChildProcess return value.
const run = promisify(execFile);

async function port(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve) => {
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  if (address === null || typeof address === "string") {
    throw new Error("Missing listener port.");
  }
  await new Promise<void>((resolve, reject) => {
    listener.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
  return address.port;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Playwright has no additional per-test fixtures.
export const test = base.extend<{}, { backend: string }>({
  backend: [
    async ({ browserName: _browserName }, useBackend, worker) => {
      const database = await evaluationDatabase();
      const sql = database.connect();
      await mkdir(path.join(ROOT, "dist"), { recursive: true });
      const directory = await mkdtemp(
        path.join(ROOT, "dist/new-lobby-browser-"),
      );
      let child: ReturnType<typeof spawn> | undefined;
      let redis: Awaited<ReturnType<typeof redisFixture>> | undefined;
      try {
        await sql.unsafe(
          await readFile(
            path.join(ROOT, "install/database_schema.sql"),
            "utf8",
          ),
        );
        await sql`CREATE TABLE schema_version(version integer NOT NULL PRIMARY KEY)`;
        await sql`INSERT INTO schema_version VALUES(5)`;
        await Promise.all(
          [
            "packages/game/src/json",
            "packages/server/src/json",
            "server/src/views",
            "install/migrations",
            "misc/word_list.txt",
            "public",
          ].map(async (relative) => {
            await mkdir(path.dirname(path.join(directory, relative)), {
              recursive: true,
            });
            await symlink(
              path.join(ROOT, relative),
              path.join(directory, relative),
            );
          }),
        );
        const httpPort = await port();
        const controlPort = await port();
        if (worker.project.name === "rust") {
          redis = await redisFixture();
        }
        const config = {
          DOMAIN: "localhost",
          SESSION_SECRET: "synthetic-browser-only-secret".repeat(8),
          PORT: httpPort,
          LOCALHOST_PORT: controlPort,
          DB_HOST: database.connection.host,
          DB_PORT: database.connection.port,
          DB_USER: database.connection.username,
          DB_PASSWORD: database.connection.password || "local-trust",
          DB_NAME: database.connection.database,
          ...(redis && { REDIS_URL: redis.url }),
        };
        await writeFile(
          path.join(directory, ".env"),
          Object.entries(config)
            .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
            .join("\n"),
        );
        let executable = path.join(directory, "hanabi-live");
        let args: string[] = [];
        if (worker.project.name === "rust") {
          const crate = path.join(ROOT, "experimental/rust-server");
          await run("cargo", ["build", "--release", "--locked"], {
            cwd: crate,
            timeout: 300_000,
          });
          await cp(
            path.join(crate, "target/release/hanabi-rust-poc"),
            executable,
          );
        } else if (worker.project.name === "typescript") {
          await run("bash", ["packages/server/build.sh"], {
            cwd: ROOT,
            timeout: 120_000,
          });
          await cp(
            path.join(ROOT, "packages/server/dist"),
            path.join(directory, "packages/server/dist"),
            { recursive: true },
          );
          await symlink(
            path.join(ROOT, "node_modules"),
            path.join(directory, "node_modules"),
          );
          executable = process.execPath;
          args = ["packages/server/dist/main.js"];
        } else {
          await run("go", ["build", "-o", executable, "."], {
            cwd: path.join(ROOT, "server/src"),
            timeout: 120_000,
          });
        }
        child = spawn(executable, args, {
          cwd: directory,
          env: {
            PATH: process.env.PATH,
            HOME: directory,
            TMPDIR: directory,
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        child.stdout?.on("data", (data) => {
          output = (output + String(data)).slice(-32_000);
        });
        child.stderr?.on("data", (data) => {
          output = (output + String(data)).slice(-32_000);
        });
        const url = `http://localhost:${httpPort}`;
        await expect(async () => {
          if (child?.exitCode !== null) {
            throw new Error(output);
          }
          const response = await fetch(`${url}/test-cookie`);
          expect([200, 204]).toContain(response.status);
        }).toPass({ timeout: 30_000 });
        await useBackend(url);
      } finally {
        if (child && child.exitCode === null) {
          const closed = once(child, "close");
          child.kill("SIGTERM");
          await closed;
        }
        await sql.end({ timeout: 3 });
        await redis?.close();
        await database.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
    { scope: "worker", timeout: 360_000 },
  ],
});

export { expect } from "@playwright/test";

export async function gameReady(page: Page): Promise<void> {
  const socket = await page.waitForEvent("websocket");
  await socket.waitForEvent("framesent", {
    predicate: (frame) =>
      typeof frame.payload === "string" && frame.payload.startsWith("loaded "),
  });
}
