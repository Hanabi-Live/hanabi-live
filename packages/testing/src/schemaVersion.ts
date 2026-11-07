import { readFileSync } from "node:fs";
import path from "node:path";

const baselineText = readFileSync(
  path.join(__dirname, "../../../install/migrations/baseline.txt"),
  "utf8",
).trim();
if (!/^(?:0|[1-9]\d{0,8})$/u.test(baselineText)) {
  throw new Error("Invalid migration baseline.");
}
const BASELINE = Number(baselineText);

export function expectedSchemaVersion(names: readonly string[]): number {
  const versions = new Set<number>();
  for (const name of names) {
    if (!name.endsWith(".sql")) {
      continue;
    }
    if (!/^\d{3,9}_[0-9_a-z]+\.sql$/u.test(name)) {
      throw new Error(`Invalid migration file: ${name}`);
    }
    const version = Number(name.split("_", 1)[0]);
    if (version <= BASELINE || versions.has(version)) {
      throw new Error(`Invalid or duplicate migration version: ${name}`);
    }
    versions.add(version);
  }
  for (
    let version = BASELINE + 1;
    version <= BASELINE + versions.size;
    version++
  ) {
    if (!versions.has(version)) {
      throw new Error(`Missing migration version: ${version}`);
    }
  }
  return BASELINE + versions.size;
}
