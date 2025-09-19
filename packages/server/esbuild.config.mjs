import { build } from "esbuild";
import { esbuildPluginPino } from "esbuild-plugin-pino";
import fs from "node:fs";
import path from "node:path";

const PACKAGE_NAME = path.basename(import.meta.dirname);
const CWD = process.cwd();

/**
 * If we do not compile the project from the root of the repository, we will get the following
 * run-time error:
 *
 * ```text
 * Error: Cannot find module 'D:\Repositories\hanabi-live\D:Repositorieshanabi-livepackagesserverdist\thread-stream-worker.js' // cspell:disable-line
 * ```
 *
 * This is because Pino splits the output into several files and they lose reference to each other.
 * Thus, we must compile and run the resulting JavaScript file from the same directory.
 *
 * The directory must be changed before this script is invoked because `process.chdir` does not seem
 * to affect esbuild.
 */
if (CWD.endsWith(PACKAGE_NAME)) {
  throw new Error(
    `esbuild for package "${PACKAGE_NAME}" must be invoked from the root of the repository.`,
  );
}

/** We cannot use `path.join` here or we will get a runtime error. */
const OUT_DIR = "packages/server/dist";

/** We cannot use `path.join` here or we will get a runtime error. */
const MAIN_TS = "packages/server/src/main.ts";

fs.rmSync(OUT_DIR, {
  recursive: true,
  force: true,
});

build({
  entryPoints: [MAIN_TS],
  bundle: true,
  outdir: OUT_DIR,

  /**
   * Required for the bundled output to work properly.
   *
   * @see https://esbuild.github.io/api/#platform
   */
  platform: "node",

  /** @see https://esbuild.github.io/api/#sourcemap */
  sourcemap: "linked",

  /** Needed to prevent a runtime error caused by the `@fastify/secure-session` plugin. */
  external: ["sodium-native"],

  /**
   * Needed so that Pino will work properly.
   *
   * @see https://github.com/davipon/esbuild-plugin-pino
   */
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
}).catch(() => process.exit(1));

// Copy the template files, which are not included in the bundle.
const TEMPLATES_DIR_SRC = path.join(import.meta.dirname, "src", "templates");
const TEMPLATES_DIR_DST = path.join(import.meta.dirname, "dist", "templates");
fs.cpSync(TEMPLATES_DIR_SRC, TEMPLATES_DIR_DST, {
  recursive: true,
});
