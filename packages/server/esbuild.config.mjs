import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const OUT_DIR = path.join(import.meta.dirname, "dist");

fs.rmSync(OUT_DIR, {
  recursive: true,
  force: true,
});

await build({
  entryPoints: [path.join(import.meta.dirname, "src", "main.ts")],
  absWorkingDir: REPO_ROOT,
  bundle: true,
  outdir: OUT_DIR,
  platform: "node",
  sourcemap: "linked",

  // Native bindings and SDK/logger workers must resolve from their installed packages.
  external: ["@sentry/node", "argon2", "discord.js", "pino"],
});

fs.cpSync(
  path.join(import.meta.dirname, "src", "templates"),
  path.join(OUT_DIR, "templates"),
  { recursive: true },
);
