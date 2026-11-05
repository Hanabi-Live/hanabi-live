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
    if (version === 0 || versions.has(version)) {
      throw new Error(`Invalid or duplicate migration version: ${name}`);
    }
    versions.add(version);
  }
  for (let version = 1; version <= versions.size; version++) {
    if (!versions.has(version)) {
      throw new Error(`Missing migration version: ${version}`);
    }
  }
  return versions.size;
}
