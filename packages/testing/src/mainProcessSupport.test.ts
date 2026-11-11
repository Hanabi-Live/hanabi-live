import { expect, test } from "bun:test";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { bounded, startProcess, stopChild } from "./mainProcessSupport.ts";

test("process readiness waits for both listeners on every start", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hanabi-readiness-"));
  await writeFile(
    path.join(directory, "hanabi-live"),
    `#!${process.execPath}\n${String.raw`
let phase = 0;
process.on("SIGUSR2", () => {
  phase++;
  if (phase === 1) {
    process.stderr.write("listening at http://127.0.0.1:40002\n");
  } else if (phase === 2) {
    process.stderr.write("Localhost operations ");
    process.stdout.write("Server listening at http://127.0.0.1:40003\n");
  } else {
    process.stderr.write("listening at http://127.0.0.1:40004\n");
  }
});
setInterval(() => {}, 1000);
process.stderr.write("Localhost operations ");
process.stdout.write("Server listening at http://127.0.0.1:40001\n");
`}`,
    { mode: 0o700 },
  );
  const state = startProcess(directory);
  try {
    if (state.child.stdout === null) {
      throw new Error("Missing child stdout.");
    }
    let settled = false;
    const first = state.ready
      .then((address) => {
        settled = true;
        return { address };
      })
      .catch((error: unknown) => ({ error }));
    await bounded(once(state.child.stdout, "data"), "first public log", 2000);
    await setImmediate();
    expect(settled).toBe(false);
    state.child.kill("SIGUSR2");
    expect(await bounded(first, "first listeners", 2000)).toEqual({
      address: "http://127.0.0.1:40001",
    });
    expect(state.output()).toContain(
      "Localhost operations listening at http://127.0.0.1:40002",
    );

    settled = false;
    const next = state
      .nextReady()
      .then((address) => {
        settled = true;
        return { address };
      })
      .catch((error: unknown) => ({ error }));
    const publicLog = once(state.child.stdout, "data");
    state.child.kill("SIGUSR2");
    await bounded(publicLog, "restarted public log", 2000);
    await setImmediate();
    expect(settled).toBe(false);
    state.child.kill("SIGUSR2");
    expect(await bounded(next, "restarted listeners", 2000)).toEqual({
      address: "http://127.0.0.1:40003",
    });
  } finally {
    await stopChild(state.child);
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
