import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const ROOT = path.resolve(__dirname, "../../..");
// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);

async function setup() {
  if (process.env["HANABI_TEST_DATABASE_URL"] === undefined) {
    return;
  }
  const started = performance.now();
  await run("cargo", ["build", "--release", "--locked"], {
    cwd: path.join(ROOT, "server"),
    timeout: 300_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  console.info(
    `Process server built in ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
}

setup().catch((error: unknown) => {
  console.error("Failed to prepare native process test backends:", error);
  process.exitCode = 1;
});
