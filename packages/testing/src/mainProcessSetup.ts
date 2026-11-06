import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const ROOT = path.resolve(__dirname, "../../..");
// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);

async function setup() {
  if (process.env["HANABI_TEST_DATABASE_URL"] === undefined) {
    return;
  }
  const directory = path.join(ROOT, "dist/process-backends");
  await mkdir(directory, { recursive: true });
  await Promise.all(
    [
      {
        name: "Go",
        file: "go",
        args: ["build", "-o", path.join(directory, "hanabi-live"), "."],
        cwd: path.join(ROOT, "server/src"),
        timeout: 120_000,
      },
      {
        name: "Rust release",
        file: "cargo",
        args: ["build", "--release", "--locked"],
        cwd: path.join(ROOT, "experimental/rust-server"),
        timeout: 300_000,
      },
    ].map(async ({ name, file, args, cwd, timeout }) => {
      const started = performance.now();
      await run(file, args, { cwd, timeout, maxBuffer: 2 * 1024 * 1024 });
      console.info(
        `Process backend ${name} built in ${((performance.now() - started) / 1000).toFixed(1)}s`,
      );
    }),
  );
}

setup().catch((error: unknown) => {
  console.error("Failed to prepare native process test backends:", error);
  process.exitCode = 1;
});
