import type { GlobalConfig } from "jest";
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const ROOT = path.resolve(__dirname, "../../..");
// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);

// eslint-disable-next-line import-x/no-default-export -- ts-prune-ignore-next: Jest loads this export dynamically.
export default async function setup(config: GlobalConfig): Promise<void> {
  if (process.env["HANABI_TEST_DATABASE_URL"] === undefined) {
    return;
  }
  const files = [
    "mainProcess.test.ts",
    "mainProcessComparison.test.ts",
    "mainProcessDurability.test.ts",
    "mainProcessCutover.test.ts",
  ].map((file) => path.join(__dirname, file));
  const selected = config.runTestsByPath
    ? files.some((file) =>
        config.nonFlagArgs.some((argument) => path.resolve(argument) === file),
      )
    : files.some((file) =>
        config.testPathPatterns
          .toExecutor({ rootDir: config.rootDir })
          .isMatch(file),
      );
  if (!selected) {
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
