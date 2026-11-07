import { evaluationDatabase, redisFixture } from "@hanabi-live/testing";
import type { Locator, Page } from "@playwright/test";
import { test as base, expect } from "@playwright/test";
import { spawn } from "node:child_process";
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

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

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

export const test = base.extend<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Playwright has no additional per-test fixtures.
  {},
  {
    backend: string;
    server: {
      url: string;
      restart: () => Promise<void>;
      stop: () => Promise<void>;
      start: () => Promise<void>;
    };
  }
>({
  backend: [
    async ({ server }, useBackend) => {
      await useBackend(server.url);
    },
    { scope: "worker" },
  ],
  server: [
    async ({ browserName: _browserName }, useBackend) => {
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
        await sql`INSERT INTO schema_version VALUES(11)`;
        await Promise.all(
          [
            "packages/game/src/json",
            "packages/data/src/json",
            "install/migrations",
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
        let controlPort = await port();
        while (controlPort === httpPort) {
          // eslint-disable-next-line no-await-in-loop -- Each candidate must be checked before allocating another.
          controlPort = await port();
        }
        redis = await redisFixture();
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
          REDIS_URL: redis.url,
        };
        await writeFile(
          path.join(directory, ".env"),
          Object.entries(config)
            .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
            .join("\n"),
        );
        const executable = path.join(directory, "hanabi-live");
        await cp(
          path.join(ROOT, "server/target/debug/hanabi-live"),
          executable,
        );
        let output = "";
        const url = `http://localhost:${httpPort}`;
        async function start(file: string, arguments_: readonly string[]) {
          child = spawn(file, arguments_, {
            cwd: directory,
            env: {
              PATH: process.env.PATH,
              HOME: directory,
              TMPDIR: directory,
            },
            stdio: ["ignore", "pipe", "pipe"],
          });
          child.stdout?.on("data", (data) => {
            output = (output + String(data)).slice(-32_000);
          });
          child.stderr?.on("data", (data) => {
            output = (output + String(data)).slice(-32_000);
          });
          await expect(async () => {
            if (child?.exitCode !== null) {
              throw new Error(output);
            }
            const response = await fetch(`${url}/test-cookie`);
            expect([200, 204]).toContain(response.status);
          }).toPass({ timeout: 30_000 });
        }
        await start(executable, []);
        await useBackend({
          url,
          restart: async () => {
            const response = await fetch(
              `http://127.0.0.1:${controlPort}/gracefulRestart`,
            );
            expect(response.status, await response.text()).toBe(200);
          },
          stop: async () => {
            if (!child || child.exitCode !== null) {
              throw new Error(
                "Cannot stop a browser fixture that is not running.",
              );
            }
            const running = child;
            const closed = once(running, "close", {
              signal: AbortSignal.timeout(30_000),
            });
            const response = await fetch(
              `http://127.0.0.1:${controlPort}/gracefulStop`,
            );
            expect(response.status, await response.text()).toBe(200);
            await closed;
            expect(running.exitCode, output).toBe(0);
            expect(running.signalCode).toBeNull();
          },
          start: async () => {
            if (child?.exitCode === null) {
              throw new Error(
                "Cannot start an already running browser fixture.",
              );
            }
            await start(executable, []);
          },
        });
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
    { scope: "worker", timeout: 30_000 },
  ],
});

export { expect } from "@playwright/test";

export async function setClassicCheckbox(
  control: Locator,
  checked = true,
): Promise<void> {
  await expect(control).toBeEnabled();
  if ((await control.isChecked()) !== checked) {
    const point = await control.evaluate((input: HTMLInputElement) => {
      const label = input.labels?.[0];
      if (!label || label.getClientRects().length === 0) {
        throw new Error("Missing rendered checkbox label.");
      }
      label.scrollIntoView({ block: "center", behavior: "instant" });
      const bounds = label.getBoundingClientRect();
      const style = getComputedStyle(label, "::before");
      /* eslint-disable unicorn/prefer-number-coercion -- Computed CSS lengths include px units. */
      const width = Number.parseFloat(style.width);
      const height = Number.parseFloat(style.height);
      const left = Number.parseFloat(style.left);
      const top = Number.parseFloat(style.top);
      /* eslint-enable unicorn/prefer-number-coercion */
      if (
        ![width, height, left, top].every(Number.isFinite)
        || width <= 0
        || height <= 0
      ) {
        throw new Error("Missing checkbox hit area.");
      }
      return { x: bounds.x + left + width / 2, y: bounds.y + top + height / 2 };
    });
    await control.page().mouse.click(point.x, point.y);
  }
  await expect(control).toBeChecked({ checked });
}

export async function gameReady(page: Page): Promise<void> {
  const socket = await page.waitForEvent("websocket");
  await socket.waitForEvent("framesent", {
    predicate: (frame) =>
      typeof frame.payload === "string" && frame.payload.startsWith("loaded "),
  });
}
