import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { ProxyOptions } from "vite";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const version = execFileSync(
  "bash",
  [`${root}/packages/client/get-version.sh`],
  { cwd: root },
)
  .toString()
  .trim();
const versionModule = "\u{0}hanabi-client-version";

export function backendProxy(target: string): Record<string, ProxyOptions> {
  const proxy: Record<string, ProxyOptions> = {};
  for (const route of [
    "/login",
    "/logout",
    "/test-cookie",
    "/ws",
    "/public",
    "/api",
    "/game",
    "/pre-game",
    "/lobby",
    "/replay",
    "/shared-replay",
    "/stats",
    "/history",
    "/scores",
    "/profile",
    "/seed",
    "/variant",
    "/missing-scores",
    "/shared-missing-scores",
    "/tags",
    "/tag",
    "/export",
    "/videos",
    "/password-reset",
  ]) {
    // Rust compares the browser's Origin with Host; do not rewrite only one of them.
    proxy[route] = { target, changeOrigin: false, ws: route === "/ws" };
  }
  return proxy;
}

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/new/" : "/public/client-new/",
  plugins: [
    {
      name: "hanabi-client-version",
      enforce: "pre",
      // The generated shared version is CommonJS; serve an equivalent ES module.
      resolveId(id, importer) {
        if (
          (id === "./version" || id === "./version.js")
          && importer !== undefined
          && importer.endsWith("/packages/data/src/index.ts")
        ) {
          return versionModule;
        }
        return undefined;
      },
      load: (id) =>
        id === versionModule || id.endsWith("/packages/data/src/version.js")
          ? `export const VERSION = ${JSON.stringify(version)};`
          : undefined,
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@hanabi-live/data": `${root}/packages/data/src/index.ts`,
      "@hanabi-live/game": `${root}/packages/game/src/index.ts`,
    },
  },
  define: {
    CLIENT_VERSION: JSON.stringify(version),
  },
  build: {
    rolldownOptions: {
      input: {
        main: fileURLToPath(new URL("index.html", import.meta.url)),
        prototypes: fileURLToPath(new URL("prototypes.html", import.meta.url)),
      },
    },
    outDir: `${root}/public/client-new`,
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    fs: {
      allow: [`${root}/packages`, `${root}/public`, `${root}/node_modules`],
    },
    proxy: backendProxy("http://127.0.0.1:8080"),
  },
}));
