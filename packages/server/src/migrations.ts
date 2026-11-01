import { sql } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { REPO_ROOT } from "./constants";
import { db } from "./db";
import { expectedSchemaVersion } from "./migrationFiles";

const schemaVersions = z.array(
  z.object({ version: z.number().int().nonnegative() }),
);

export async function verifyDatabaseMigrations(): Promise<void> {
  const directory = path.join(REPO_ROOT, "install", "migrations");
  const files = fs.readdirSync(directory, { withFileTypes: true });
  for (const file of files) {
    if (file.name.endsWith(".sql") && !file.isFile()) {
      throw new Error(`Invalid migration file: ${file.name}`);
    }
  }
  const expected = expectedSchemaVersion(files.map((file) => file.name));
  if (expected === 0) {
    return;
  }
  const rows = schemaVersions.parse(
    await db.execute(sql`SELECT version FROM public.schema_version`),
  );
  const row = rows[0];
  if (rows.length !== 1 || row === undefined || row.version < expected) {
    throw new Error(
      `The database needs schema version ${expected}. Run ./install/migrate.sh apply.`,
    );
  }
}
