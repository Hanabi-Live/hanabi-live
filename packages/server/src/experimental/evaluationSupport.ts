// The evaluation parser mirrors nested wire payloads.
/* eslint-disable unicorn/max-nested-calls */
import { assertDefined, isArray } from "complete-common";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import postgres from "postgres";
// The evaluation client uses the existing transport supplied by @fastify/websocket.
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { WebSocket } from "ws";
import { z } from "zod";
import {
  cardSchema,
  eventSchema,
  format,
  moveSchema,
  stateSchema,
} from "./engine";

const visibleCard = z.object({
  order: z.number(),
  suitIndex: z.number(),
  rank: z.number(),
});
const responseSchema = z.object({
  type: z.enum(["ok", "error", "update"]),
  requestID: z.string().optional(),
  tableID: z.string().optional(),
  revision: z.number().optional(),
  duplicate: z.boolean().optional(),
  acceptedRevision: z.number().optional(),
  error: z.string().optional(),
  state: stateSchema
    .omit({ hands: true })
    .extend({
      hands: z.array(z.array(visibleCard)),
      revealed: z.array(visibleCard),
      remaining: z.number(),
    })
    .optional(),
  events: z.array(eventSchema).optional(),
  replay: z
    .object({
      format: z.literal(format),
      deck: z.array(cardSchema),
      actions: z.array(z.object({ player: z.number(), move: moveSchema })),
      state: stateSchema,
      events: z.array(eventSchema),
    })
    .optional(),
});
export type SliceResponse = z.infer<typeof responseSchema>;
export const evaluationConnectionSchema = z.strictObject({
  host: z
    .string()
    .refine(
      (host) =>
        host.startsWith("/") || host === "localhost" || host === "127.0.0.1",
    ),
  username: z.string(),
  password: z.string(),
  port: z.number().int().positive(),
  database: z.string().regex(/^ts_slice_[\da-f]{32}$/u),
});
type EvaluationConnection = z.infer<typeof evaluationConnectionSchema>;
interface EvaluationDatabase {
  connection: EvaluationConnection;
  connect: () => postgres.Sql;
  close: () => Promise<void>;
}
interface EvaluationClient {
  updates: SliceResponse[];
  request: (input: object, requestID?: string) => Promise<SliceResponse>;
  close: () => Promise<void>;
}

export function evaluationPool(connection: EvaluationConnection): postgres.Sql {
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
      statement_timeout: 2000,
      lock_timeout: 2000,
      idle_in_transaction_session_timeout: 3000,
    },
    onnotice: () => undefined,
  };
  const admin = postgres({ ...options, database, max: 1 });
  const name = `ts_slice_${randomUUID().replaceAll("-", "")}`;
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

/**
 * Real WebSockets with pre-provisioned bearer sessions; no user identity is accepted in commands.
 */
export async function connectClient(
  url: string,
  token: string,
): Promise<EvaluationClient> {
  const socket = new WebSocket(url, { headers: { authorization: token } });
  const pending = new Map<
    string,
    {
      resolve: (response: SliceResponse) => void;
      reject: (error: Error) => void;
    }
  >();
  const updates: SliceResponse[] = [];
  socket.on("message", (data) => {
    let text: string;
    if (isArray(data)) {
      text = Buffer.concat(data).toString();
    } else if (data instanceof ArrayBuffer) {
      text = Buffer.from(data).toString();
    } else {
      text = data.toString();
    }
    const response = responseSchema.parse(JSON.parse(text));
    if (response.type === "update") {
      updates.push(response);
      return;
    }
    const key = response.requestID ?? pending.keys().next().value;
    if (key !== undefined) {
      pending.get(key)?.resolve(response);
    }
  });
  socket.on("close", () => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error("Experimental connection closed."));
    }
  });
  await once(socket, "open");
  return {
    updates,
    async request(
      input: object,
      requestID: string = randomUUID(),
    ): Promise<SliceResponse> {
      if (pending.has(requestID)) {
        throw new Error("Test client already has a request with that ID.");
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await new Promise<SliceResponse>((resolve, reject) => {
          pending.set(requestID, { resolve, reject });
          timeout = setTimeout(() => {
            reject(new Error("Experimental response deadline exceeded."));
          }, 5000);
          socket.send(JSON.stringify({ ...input, requestID }));
        });
      } finally {
        clearTimeout(timeout);
        pending.delete(requestID);
      }
    },
    async close() {
      if (socket.readyState === socket.CLOSED) {
        return;
      }
      const closed = once(socket, "close");
      socket.close();
      await closed;
    },
  };
}
