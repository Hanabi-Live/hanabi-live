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
  sourcemap: true,
  platform: "node",
  external: ["sodium-native"],
  plugins: [esbuildPluginPino({ transports: ["pino-pretty"] })],
}).catch(() => process.exit(1));

// Copy the template files, which are not included in the bundle.
fs.cpSync("packages/server/src/templates", `${outdir}/templates`, {
  recursive: true,
});
