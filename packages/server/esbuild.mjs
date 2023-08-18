import { build } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import fs from "node:fs";

/** See the comment in "build.sh". */
const outdir = "packages/server/dist";

fs.rmSync(outdir, { recursive: true, force: true });

build({
  entryPoints: ["packages/server/src/main.ts"],
  bundle: true,
  outdir,
  platform: "node",

  /**
   * The default is "linked", but we want to enable full stack traces so that users can report more
   * useful error messages.
   *
   * @see https://esbuild.github.io/api/#sourcemap
   */
  sourcemap: "inline",

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
fs.cpSync("packages/server/src/templates", `${outdir}/templates`, {
  recursive: true,
});
