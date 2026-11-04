import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const version = execFileSync("git", ["rev-list", "--count", "HEAD"], {
  cwd: root,
})
  .toString()
  .trim();
const versionModule = "\u{0}hanabi-client-version";

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
    proxy: {
      "/login": "http://127.0.0.1:8080",
      "/logout": "http://127.0.0.1:8080",
      "/test-cookie": "http://127.0.0.1:8080",
      "/ws": { target: "ws://127.0.0.1:8080", ws: true },
      "/game": "http://127.0.0.1:8080",
      "/public": "http://127.0.0.1:8080",
    },
  },
}));
