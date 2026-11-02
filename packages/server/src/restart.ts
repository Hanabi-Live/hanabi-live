// cspell:words execve
import { assertDefined } from "complete-common";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { REPO_ROOT } from "./constants";
import { IS_DEV } from "./env";

// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores the ChildProcess return value.
const run = promisify(execFile);

export async function prepareRestart(): Promise<void> {
  if (typeof process.execve !== "function" || process.platform === "win32") {
    throw new Error("This platform cannot replace the running Node process.");
  }
  const entry = process.argv[1];
  assertDefined(entry, "Missing compiled server entry point.");
  const version = await readFile(
    path.join(REPO_ROOT, "public/js/bundles/version.txt"),
    "utf8",
  );
  if (!/^\d+\s*$/u.test(version) || !Number.isSafeInteger(Number(version))) {
    throw new Error("The paired client version file is invalid.");
  }
  const args = ["--require", "argon2", "--require", "pino"];
  if (IS_DEV) {
    args.push("--require", "pino-pretty");
  }
  args.push("--check", path.resolve(entry));
  await run(process.execPath, args, {
    cwd: REPO_ROOT,
    timeout: 30_000,
    maxBuffer: 1024 * 1024,
  });
}

export function replaceProcess(): never {
  if (typeof process.execve !== "function") {
    throw new TypeError("Process replacement is not supported.");
  }
  process.execve(
    process.execPath,
    [process.execPath, ...process.execArgv, ...process.argv.slice(1)],
    process.env,
  );
  throw new Error("Process replacement unexpectedly returned.");
}
