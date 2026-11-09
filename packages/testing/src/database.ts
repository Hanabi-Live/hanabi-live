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

export interface LiveTable {
  readonly id: number;
  readonly revision: number;
  readonly payload: unknown;
}

/** Reads the live tables that the server saved, in table order. */
export async function liveTables(
  sql: postgres.Sql,
): Promise<readonly LiveTable[]> {
  const rows =
    await sql`SELECT id, revision, payload FROM live_tables ORDER BY id`;
  return rows.map((row) => {
    const { id, revision, payload } = liveTableSchema.parse(row);
    return {
      id,
      revision,
      payload: payload === null ? undefined : (JSON.parse(payload) as unknown),
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
