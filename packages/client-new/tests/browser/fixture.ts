import { evaluationDatabase, redisFixture } from "@hanabi-live/testing";
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

export const test = base.extend<
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Playwright has no additional per-test fixtures.
  {},
  {
    backend: string;
    restartLoad: boolean;
    server: {
      url: string;
      restart: () => Promise<void>;
      seedHistories: () => Promise<void>;
    };
  }
>({
  restartLoad: [false, { option: true, scope: "worker" }],
  backend: [
    async ({ server }, useBackend) => {
      await useBackend(server.url);
    },
    { scope: "worker" },
  ],
  server: [
    async ({ browserName: _browserName, restartLoad }, useBackend) => {
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
        if (restartLoad) {
          await sql.begin(async (archiveSQL) => {
            await archiveSQL.unsafe("SET LOCAL statement_timeout = '120s'");
            await archiveSQL`
            INSERT INTO users(id,username,normalized_username,password_hash,last_ip)
                        VALUES(-1,'history','history','unused','127.0.0.1')
          `;
            await archiveSQL`
            INSERT INTO games(name,num_players,variant_id,timed,time_base,time_per_turn,
                        speedrun,card_cycle,deck_plays,empty_clues,one_extra_card,one_less_card,
                        all_or_nothing,detrimental_characters,seed,score,num_turns,end_condition,datetime_started,datetime_finished)
                        SELECT 'Archive fixture',2,0,false,0,0,false,false,false,false,false,false,false,false,
                        'p2v0s'||n,25,60,1,NOW(),NOW() FROM generate_series(1,2000000) n
          `;
            await archiveSQL`
            INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
                        SELECT id,-1,0,-1,0 FROM games
          `;
            await archiveSQL.unsafe(
              "ANALYZE games; ANALYZE game_participants; ANALYZE user_friends",
            );
          });
          await run("cargo", ["build", "--release", "--locked"], {
            cwd: path.join(ROOT, "server"),
            timeout: 300_000,
          });
        }
        await Promise.all(
          [
            "packages/game/src/json",
            "packages/data/src/json",
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
          path.join(
            ROOT,
            `server/target/${restartLoad ? "release" : "debug"}/hanabi-live`,
          ),
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
          seedHistories: async () => {
            if (!restartLoad) {
              throw new Error(
                "History seeding is restricted to the restart fixture.",
              );
            }
            await sql.begin(async (historySQL) => {
              await historySQL.unsafe("SET LOCAL statement_timeout = '120s'");
              await historySQL`INSERT INTO users(id,username,normalized_username,password_hash,last_ip)
                VALUES(-2,'frequent','frequent','unused','127.0.0.1')`;
              await historySQL`INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
                SELECT id,-2,1,-1,0 FROM games WHERE id <= 40000`;
              await historySQL`INSERT INTO game_participants(game_id,user_id,seat,character_assignment,character_metadata)
                SELECT g.id,u.id,1,-1,0 FROM games g CROSS JOIN users u
                WHERE g.id <= 3 AND u.username IN ('testRestartA','testRestartD','testRestartE')`;
              await historySQL`INSERT INTO user_friends(user_id,friend_id)
                SELECT id,-2 FROM users WHERE username='testRestartC'`;
              await historySQL`INSERT INTO user_friends(user_id,friend_id)
                SELECT a.id,b.id FROM users a CROSS JOIN users b
                WHERE a.username='testRestartD' AND b.username='testRestartE'`;
              await historySQL.unsafe(
                "ANALYZE game_participants; ANALYZE user_friends",
              );
            });
          },
          restart: async () => {
            const response = await fetch(
              `http://127.0.0.1:${controlPort}/gracefulRestart`,
            );
            expect(response.status, await response.text()).toBe(200);
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
