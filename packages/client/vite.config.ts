import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const VERSION_PATH = path.join(REPO_ROOT, "packages/data/src/version.js");

/** The port that "server/templates/vite-dev.html" loads the development client from. */
const DEV_SERVER_PORT = 5173;

/**
 * The mode that builds the script of the server's public pages, such as a player's history, instead
 * of the client: `vite build --mode public-pages`. A classic script holds everything that it
 * imports, so each one is a separate build.
 */
const PUBLIC_PAGES_MODE = "public-pages";

function readVersion(code: string): string {
  const match = /VERSION = "([^"]+)"/u.exec(code);
  if (match?.[1] === undefined) {
    throw new Error(`Failed to parse the client version from: ${VERSION_PATH}`);
  }
  return match[1];
}

/** The name of the script that a build makes, or `undefined` for Vite's default. */
function entryFileName(command: string, mode: string): string | undefined {
  if (mode === PUBLIC_PAGES_MODE) {
    return "public-pages.min.js";
  }
  return command === "build"
    ? `main.${readVersion(readFileSync(VERSION_PATH, "utf8"))}.min.js`
    : undefined;
}

export default defineConfig(({ command, mode }) => ({
  plugins: [react(), tailwindcss()],
  publicDir: false,
  resolve: {
    alias: {
      "@hanabi-live/data": path.join(REPO_ROOT, "packages/data/src/index.ts"),
      "@hanabi-live/game": path.join(REPO_ROOT, "packages/game/src/index.ts"),
    },
  },
  build: {
    outDir: path.join(REPO_ROOT, "public/js/bundles"),
    // The directory also holds the other bundles and version metadata.
    emptyOutDir: false,
    sourcemap: true,
    modulePreload: false,
    // The client ships as a single bundle.
    chunkSizeWarningLimit: 2000,
    rolldownOptions: {
      input: path.join(
        import.meta.dirname,
        mode === PUBLIC_PAGES_MODE
          ? "src/publicPages/index.tsx"
          : "src/main.ts",
      ),
      output: {
        // The server templates load the scripts as classic scripts.
        format: "iife",
        entryFileNames: entryFileName(command, mode),
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
    include: ["src/**/*.test.{ts,tsx}"],
  },
}));
