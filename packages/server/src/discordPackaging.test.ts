import { expect, test } from "@jest/globals";
import { assertDefined } from "complete-common";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

test("compiled disabled integrations and injected bridges never load optional SDKs", async () => {
  const result = await build({
    absWorkingDir: path.resolve(__dirname, "../../.."),
    stdin: {
      resolveDir: __dirname,
      sourcefile: "discord-packaging-probe.js",
      contents: String.raw`
        import { DiscordBridge } from "./discordBridge";
        import { initializeErrorReporting, reportServerError } from "./errorReporting";
        import assert from "node:assert/strict";
        import { createServer } from "node:http";
        import { gunzipSync } from "node:zlib";
        const unused = () => { throw new Error("Unexpected bridge work."); };
        const options = {
          store: {
            insertDiscord: unused, deleteDiscord: unused,
            linkDiscordMessageID: unused, getPublicDiscordMessage: unused,
          },
          admission: { paused: false, run: unused },
          publishChat: unused, publishDeletion: unused,
          classifyCommand: unused, command: unused, log() {},
        };
        const config = {
          DISCORD_TOKEN: "synthetic-only",
          DISCORD_GUILD_ID: "100000000000000000",
          DISCORD_CHANNEL_SYNC_WITH_LOBBY: "200000000000000000",
          DISCORD_CHANNEL_WEBSITE_DEVELOPMENT: "300000000000000000",
          DISCORD_PING_CREW_ROLE_NAME: "Crew",
          DISCORD_TRUSTED_TEACHER_ROLE_NAME: "Crew",
        };
        async function main() {
          await initializeErrorReporting(false, undefined, "test-release");
          await initializeErrorReporting(true, "https://synthetic@sentry.invalid/1", "test-release");
          const disabled = new DiscordBridge({ ...options, environment: {} });
          await disabled.start();
          const invalid = new DiscordBridge({
            ...options, environment: { DISCORD_TOKEN: "synthetic-only" },
          });
          await invalid.start();
          const injected = new DiscordBridge({
            ...options, environment: config,
            transport: {
              async start() { return "synthetic-bot"; },
              async roles() { return [{ id: "crew", name: "Crew" }]; },
              async close() {},
            },
          });
          await injected.start();
          console.log(JSON.stringify([
            disabled.status, invalid.status, injected.status,
          ]));
          await Promise.all([disabled.close(), invalid.close(), injected.close()]);
          const received = Promise.withResolvers();
          const receiver = createServer((request, response) => {
            const chunks = [];
            request.on("data", (chunk) => chunks.push(chunk));
            request.on("end", () => {
              const bytes = Buffer.concat(chunks);
              const body = request.headers["content-encoding"] === "gzip"
                ? gunzipSync(bytes) : bytes;
              response.end("{}");
              received.resolve(JSON.parse(body.toString().split("\n")[2]));
            });
          });
          await new Promise((resolve) => receiver.listen(0, "127.0.0.1", resolve));
          try {
            globalThis.allowErrorReporterSDK = true;
            const close = await initializeErrorReporting(
              false, "http://synthetic@127.0.0.1:" + receiver.address().port + "/1",
              "test-release",
            );
            reportServerError();
            assert.equal(await close(), true);
            const event = await received.promise;
            assert.equal(event.release, "test-release");
            for (const key of ["request", "user", "extra", "breadcrumbs", "server_name"]) {
              assert.equal(event[key], undefined);
            }
            assert.equal(event.exception.values[0].value, "Server error; inspect local logs.");
            for (const frame of event.exception.values[0].stacktrace.frames) {
              assert.equal(frame.filename.includes("/"), false);
              assert.equal(frame.vars, undefined);
              assert.equal(frame.context_line, undefined);
            }
          } finally {
            await new Promise((resolve) => receiver.close(resolve));
          }
        }
        main().catch((error) => { console.error(error); process.exitCode = 1; });
      `,
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["@sentry/node", "discord.js"],
    write: false,
    metafile: true,
  });
  expect(
    Object.keys(result.metafile.inputs).some((file) =>
      file.includes("node_modules/discord.js/"),
    ),
  ).toBe(false);
  const output = result.outputFiles[0];
  assertDefined(output, "Missing compiled Discord packaging probe.");
  const child = spawn(process.execPath, ["-"], {
    cwd: path.resolve(__dirname, "../../.."),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const closed = once(child, "close");
  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
  }, 10_000);
  try {
    child.stdin.end(`
      require("node:module").registerHooks({
        resolve(specifier, context, nextResolve) {
          if (specifier === "discord.js" ||
              (specifier === "@sentry/node" && !globalThis.allowErrorReporterSDK)) {
            throw new Error("An optional SDK was eagerly loaded.");
          }
          return nextResolve(specifier, context);
        },
      });
      ${output.text}
    `);
    await closed;
    expect({ exitCode: child.exitCode, stderr }).toEqual({
      exitCode: 0,
      stderr: "",
    });
    expect(stdout.trim()).toBe('["disabled","degraded","ready"]');
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
      await closed;
    }
  }
}, 15_000);
