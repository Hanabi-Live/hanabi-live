import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores execFile's ChildProcess return value.
const run = promisify(execFile);

// eslint-disable-next-line import-x/no-default-export -- Playwright requires a default export for global setup.
export default async function globalSetup(): Promise<void> {
  const directory = path.join(ROOT, "dist/browser-backends");
  await mkdir(directory, { recursive: true });
  await Promise.all(
    [
      {
        name: "Go",
        file: "go",
        args: ["build", "-o", path.join(directory, "hanabi-live"), "."],
        cwd: path.join(ROOT, "server/src"),
      },
      {
        name: "Rust",
        file: "cargo",
        // Keep password hashing fast without optimizing our code on every rebuild.
        args: [
          "build",
          "--locked",
          "--config",
          'profile.dev.package."*".opt-level=3',
          "--config",
          "profile.dev.debug=0",
        ],
        cwd: path.join(ROOT, "experimental/rust-server"),
      },
      {
        name: "TypeScript",
        file: "bash",
        args: ["packages/server/build.sh"],
        cwd: ROOT,
      },
    ].map(async ({ name, file, args, cwd }) => {
      const started = performance.now();
      await run(file, args, { cwd, timeout: 300_000 });
      console.info(
        `Browser backend ${name} built in ${((performance.now() - started) / 1000).toFixed(1)}s`,
      );
    }),
  );
}
