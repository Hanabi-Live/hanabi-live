import { expect, test } from "@jest/globals";
import { assertDefined } from "complete-common";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

test("compiled disabled, invalid, and injected bridges never load the optional Discord SDK", async () => {
  const result = await build({
    absWorkingDir: path.resolve(__dirname, "../../.."),
    stdin: {
      resolveDir: __dirname,
      sourcefile: "discord-packaging-probe.js",
      contents: `
        import { DiscordBridge } from "./discordBridge";
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
        }
        main().catch((error) => { console.error(error); process.exitCode = 1; });
      `,
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["discord.js"],
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
          if (specifier === "discord.js") {
            throw new Error("Optional Discord SDK was eagerly loaded.");
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
