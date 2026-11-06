import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify ignores execFile's ChildProcess return value.
const run = promisify(execFile);

// eslint-disable-next-line import-x/no-default-export -- Playwright requires a default export for global setup.
export default async function globalSetup(): Promise<void> {
  const started = performance.now();
  await run(
    "cargo",
    [
      "build",
      "--locked",
      "--config",
      "profile.dev.package.argon2.opt-level=3",
      "--config",
      "profile.dev.debug=0",
    ],
    { cwd: path.join(ROOT, "server"), timeout: 300_000 },
  );
  console.info(
    `Browser server built in ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
}
