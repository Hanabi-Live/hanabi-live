import { assertDefined } from "complete-common";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { z } from "zod";

const evaluationConnectionSchema = z.strictObject({
  host: z
    .string()
    .refine(
      (host) =>
        host.startsWith("/") || host === "localhost" || host === "127.0.0.1",
    ),
  username: z.string(),
  password: z.string(),
  port: z.number().int().positive(),
  database: z.string().regex(/^hanabi_test_[\da-f]{32}$/u),
});

type EvaluationConnection = z.infer<typeof evaluationConnectionSchema>;

interface EvaluationDatabase {
  connection: EvaluationConnection;
  connect: () => postgres.Sql;
  close: () => Promise<void>;
}

function evaluationPool(connection: EvaluationConnection): postgres.Sql {
  return postgres({
    ...evaluationConnectionSchema.parse(connection),
    ssl: false,
    max: 3,
    connect_timeout: 3,
    idle_timeout: 0,
    max_lifetime: 0,
    connection: {
      statement_timeout: 2000,
      lock_timeout: 2000,
      idle_in_transaction_session_timeout: 3000,
    },
    onnotice: () => undefined,
  });
}

const liveTableSchema = z.object({
  id: z.coerce.number().int().positive(),
  revision: z.coerce.number().int().nonnegative(),
  payload: z.string().nullable(),
});

const livePartSchema = z.object({
  table_id: z.coerce.number().int().positive(),
  part: z.string(),
  value: z.string(),
});

export interface LiveTable {
  readonly id: number;
  readonly revision: number;
  readonly payload: unknown;
}

/**
 * The lists that a checkpoint stores as parts, as `server/src/checkpoint.rs` defines them: the
 * prefix of each part's key, the path to the object that holds the list, the list's field, and
 * whether the list is an array.
 */
const PART_LISTS = [
  ["chat", [], "chat", true],
  ["step", ["phase", "snapshot", "game"], "steps", true],
  ["notes", ["phase", "snapshot"], "notes", true],
  ["spectatorNotes", ["phase", "snapshot"], "spectator_notes", false],
] as const;

/** Rebuilds a checkpoint's JSON from its head and parts, as the server does. */
function withParts(head: unknown, parts: ReadonlyMap<string, string>): unknown {
  for (const [prefix, path, field, isArray] of PART_LISTS) {
    let parent: unknown = head;
    for (const key of path) {
      parent =
        typeof parent === "object" && parent !== null
          ? (parent as Record<string, unknown>)[key]
          : undefined;
    }
    if (typeof parent !== "object" || parent === null || field in parent) {
      continue;
    }
    const entries = [...parts]
      .filter(([key]) => key.startsWith(`${prefix}/`))
      .map(
        ([key, value]) =>
          [key.slice(prefix.length + 1), JSON.parse(value) as unknown] as const,
      );
    (parent as Record<string, unknown>)[field] = isArray
      ? entries
          .toSorted(([a], [b]) => Number(a) - Number(b))
          .map(([, value]) => value)
      : Object.fromEntries(entries);
  }
  return head;
}

/** Reads the live tables that the server saved, in table order. */
export async function liveTables(
  sql: postgres.Sql,
): Promise<readonly LiveTable[]> {
  const [rows, partRows] = await sql.begin(async (transaction) => [
    await transaction`SELECT id, revision, payload FROM live_tables ORDER BY id`,
    await transaction`SELECT table_id, part, value FROM live_table_parts`,
  ]);
  const parts = new Map<number, Map<string, string>>();
  for (const row of partRows) {
    const { table_id: tableID, part, value } = livePartSchema.parse(row);
    const tableParts = parts.get(tableID) ?? new Map<string, string>();
    tableParts.set(part, value);
    parts.set(tableID, tableParts);
  }
  return rows.map((row) => {
    const { id, revision, payload } = liveTableSchema.parse(row);
    return {
      id,
      revision,
      payload:
        payload === null
          ? undefined
          : withParts(JSON.parse(payload), parts.get(id) ?? new Map()),
    };
  });
}

/** Provision a disposable database, never source .env or touch the ordinary app schema. */
export async function evaluationDatabase(): Promise<EvaluationDatabase> {
  const selector = process.env["HANABI_TEST_DATABASE_URL"];
  if (selector === undefined) {
    throw new Error(
      "Set HANABI_TEST_DATABASE_URL to an explicit disposable PostgreSQL test service.",
    );
  }
  const settings = new Map<string, string>();
  if (
    selector.startsWith("postgres://")
    || selector.startsWith("postgresql://")
  ) {
    const url = new URL(selector);
    settings.set("host", url.searchParams.get("host") ?? url.hostname);
    settings.set("port", url.port === "" ? "5432" : url.port);
    settings.set("user", decodeURIComponent(url.username));
    settings.set("password", decodeURIComponent(url.password));
    settings.set("dbname", url.pathname.slice(1));
  } else {
    for (const part of selector.split(/\s+/u)) {
      const equal = part.indexOf("=");
      if (equal < 1) {
        throw new Error("Use an unquoted libpq test DSN or PostgreSQL URL.");
      }
      const key = part.slice(0, equal);
      if (
        !["dbname", "host", "password", "port", "sslmode", "user"].includes(key)
      ) {
        throw new Error(`Unsupported test DSN key: ${key}`);
      }
      settings.set(key, part.slice(equal + 1));
    }
  }
  const host = settings.get("host");
  const username = settings.get("user");
  const database = settings.get("dbname");
  assertDefined(host, "Missing test database host.");
  assertDefined(username, "Missing test database user.");
  assertDefined(database, "Missing test database name.");
  if (!host.startsWith("/") && host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Evaluation requires a local test PostgreSQL service.");
  }
  if (settings.has("sslmode") && settings.get("sslmode") !== "disable") {
    throw new Error(
      "Only local sslmode=disable is supported by this evaluation helper.",
    );
  }
  const options = {
    host,
    username,
    password: settings.get("password") ?? "",
    port: z.coerce
      .number()
      .int()
      .positive()
      .parse(settings.get("port") ?? 5432),
    ssl: false as const,
    max: 3,
    connect_timeout: 3,
    idle_timeout: 3,
    connection: {
      // Database DDL can wait for a forced checkpoint during parallel tests.
      statement_timeout: 30_000,
      lock_timeout: 2000,
      idle_in_transaction_session_timeout: 3000,
    },
    onnotice: () => undefined,
  };
  const admin = postgres({ ...options, database, max: 1 });
  const name = `hanabi_test_${randomUUID().replaceAll("-", "")}`;
  try {
    await admin`CREATE DATABASE ${admin(name)}`;
  } catch (error) {
    await admin.end({ timeout: 3 });
    throw error;
  }
  const connection = {
    host,
    username,
    password: options.password,
    port: options.port,
    database: name,
  };
  return {
    connection,
    connect: () => evaluationPool(connection),
    async close() {
      try {
        await admin`DROP DATABASE ${admin(name)}`;
      } finally {
        await admin.end({ timeout: 3 });
      }
    },
  };
}
