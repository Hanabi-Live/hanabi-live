import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const VERSION_PATH = path.join(REPO_ROOT, "packages/data/src/version.js");

/** The port that "server/templates/main.html" loads the development client from. */
const DEV_SERVER_PORT = 5173;

function readVersion(code: string): string {
  const match = /VERSION: "([^"]+)"/u.exec(code);
  if (match?.[1] === undefined) {
    throw new Error(`Failed to parse the client version from: ${VERSION_PATH}`);
  }
  return match[1];
}

/**
 * "set-version.sh" writes the version as CommonJS for Grunt. Vite serves workspace sources as
 * native ES modules, so expose the same value as an ES module.
 */
function versionModule(): Plugin {
  return {
    name: "hanabi-client-version",
    enforce: "pre",
    transform: (code, id) =>
      id === VERSION_PATH
        ? {
            code: `export const VERSION = ${JSON.stringify(readVersion(code))};`,
            map: { mappings: "" },
          }
        : undefined,
  };
}

export default defineConfig(({ command }) => ({
  plugins: [versionModule()],
  publicDir: false,
  resolve: {
    alias: {
      "@hanabi-live/data": path.join(REPO_ROOT, "packages/data/src/index.ts"),
      "@hanabi-live/game": path.join(REPO_ROOT, "packages/game/src/index.ts"),
    },
  },
  build: {
    outDir: path.join(REPO_ROOT, "public/js/bundles"),
    // The directory also holds the pips reference bundle and version metadata.
    emptyOutDir: false,
    sourcemap: true,
    modulePreload: false,
    // The client ships as a single bundle.
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      input: path.join(import.meta.dirname, "src/main.ts"),
      output: {
        // The server templates load the client as a classic script.
        format: "iife",
        entryFileNames:
          command === "build"
            ? `main.${readVersion(readFileSync(VERSION_PATH, "utf8"))}.min.js`
            : undefined,
      },
    },
  },
  server: {
    port: DEV_SERVER_PORT,
    strictPort: true,
    // The game server serves the page, so the client modules must point back to this server.
    origin: `http://localhost:${DEV_SERVER_PORT}`,
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
}));
