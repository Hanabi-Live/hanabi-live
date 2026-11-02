import fastifyFormBody from "@fastify/formbody";
import type { TableID } from "@hanabi-live/data";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { fastify } from "fastify";
import { STATUS_CODES } from "node:http";
import { z } from "zod";
import { announceServer } from "../administration";
import { incomingCommands } from "../commandAdmission";
import { HTTP_TIMEOUTS, STARTING_GIT_COMMIT_SHA1 } from "../constants";
import { getDatabasePoolReports } from "../db";
import { getDiscordBridge } from "../discordRuntime";
import { env } from "../env";
import { getGameRuntime } from "../gameRuntime";
import { logger } from "../logger";
import { isMaintenanceMode, setMaintenanceMode } from "../maintenanceMode";
import { models } from "../models";
import { commandMetrics, getRecoveryMetrics } from "../operationMetrics";
import { getShutdownControl, ShutdownRejected } from "../shutdown";
import { getTable, getTableIDs } from "../tables";
import { getCameOnline, getUptime, getUptimeSeconds } from "../uptime";
import { normalizeString } from "../utils";
import { wsError, wsWarning } from "../wsHelpers";
import { getUserList, wsUsers } from "../wsUsers";
import { getHTTPErrorStatus } from "./httpError";

function mib(bytes: number) {
  return Math.floor(bytes / 1024 / 1024);
}

function shutdownControl() {
  const control = getShutdownControl();
  if (control === undefined) {
    throw new ShutdownRejected("Lifecycle operations are not initialized.", {
      statusCode: 503,
    });
  }
  return control;
}

export async function httpOperationsInit(): Promise<FastifyInstance> {
  const server = await createOperationsServer();
  const address = await server.listen({
    host: "127.0.0.1",
    port: env.LOCALHOST_PORT,
  });
  logger.info(`Localhost operations listening at ${address}`);
  return server;
}

function mutation(
  handler: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const admitted = await incomingCommands.run(async () => {
      await handler(request, reply);
    });
    if (!admitted) {
      await reply
        .code(503)
        .send({ error: "The server is draining for maintenance." });
    }
  };
}

export async function createOperationsServer(): Promise<FastifyInstance> {
  const server = fastify(HTTP_TIMEOUTS);
  server.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    if (
      request.headers.origin !== undefined
      || request.headers["sec-fetch-site"] === "cross-site"
    ) {
      await reply
        .code(403)
        .send(
          "Browser requests are not allowed on the localhost operations interface.\n",
        );
    }
  });
  await server.register(fastifyFormBody);
  server.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ShutdownRejected) {
      await reply
        .code(error.statusCode)
        .type("text/plain")
        .send(`${error.message}\n`);
      return;
    }
    logger.error(`Localhost operation failed: ${String(error)}`);
    const status = getHTTPErrorStatus(error);
    await reply
      .code(status)
      .type("text/plain")
      .send(
        status >= 500
          ? "Internal server error.\n"
          : `${STATUS_CODES[status] ?? "Request rejected"}.\n`,
      );
  });
  for (const action of ["ban", "mute", "sendWarning", "sendError"] as const) {
    server.post(
      `/${action}`,
      mutation(async (request, reply) => {
        await userAction(action, request, reply);
      }),
    );
  }
  server.post(
    "/sendWarningAll",
    mutation(async (request, reply) => {
      const parsed = z
        .object({ msg: z.string().min(1) })
        .safeParse(request.body);
      if (!parsed.success) {
        await reply.code(400).send('You must send a "msg" POST parameter.\n');
        return;
      }
      let sent = 0;
      for (const user of wsUsers.values()) {
        if (user.connection.readyState === user.connection.OPEN) {
          wsWarning(user.connection, parsed.data.msg);
          sent++;
        }
      }
      await reply
        .type("text/plain")
        .send(
          wsUsers.size === 0
            ? "No users found online\n"
            : `Message sent to ${sent} out of ${wsUsers.size} found online.`,
        );
    }),
  );
  server.get("/terminate", mutation(terminate));
  server.post("/terminate", mutation(terminate));
  server.get(
    "/clearEmptyTables",
    mutation(async (_request, reply) => {
      const runtime = getGameRuntime();
      if (runtime === undefined) {
        throw new Error("Game runtime is not initialized.");
      }
      for (const id of getTableIDs()) {
        // eslint-disable-next-line no-await-in-loop
        await runtime.clearEmptyTable(id);
      }
      await reply.type("text/plain").send("success\n");
    }),
  );
  server.get("/version", async (_request, reply) => {
    await reply.type("text/plain").send(`${STARTING_GIT_COMMIT_SHA1}\n`);
  });
  server.get("/uptime", async (_request, reply) => {
    await reply.type("text/plain").send(`${getCameOnline()}\n${getUptime()}\n`);
  });
  server.get("/memory", async (_request, reply) => {
    const memory = process.memoryUsage();
    await reply
      .type("text/plain")
      .send(
        `\nMemory Report:\n  Heap used = ${mib(memory.heapUsed)} MiB\n  Heap total = ${mib(memory.heapTotal)} MiB\n  RSS = ${mib(memory.rss)} MiB\n`,
      );
  });
  server.get("/metrics", metrics);
  server.get(
    "/maintenance",
    mutation(async (_request, reply) => {
      if (isMaintenanceMode()) {
        await reply
          .code(400)
          .send("The server is already in maintenance mode.\n");
        return;
      }
      setMaintenanceMode(true);
      await announceServer(
        "The server is entering maintenance mode. New game creation has been disabled.",
      );
      await reply.type("text/plain").send("success\n");
    }),
  );
  server.get(
    "/unmaintenance",
    mutation(async (_request, reply) => {
      if (!isMaintenanceMode()) {
        await reply
          .code(400)
          .send(
            "The server is not in maintenance mode, so you cannot unmaintenance it.\n",
          );
        return;
      }
      setMaintenanceMode(false);
      await announceServer(
        "Server maintenance is complete. New game creation has been enabled.",
      );
      await reply.type("text/plain").send("success\n");
    }),
  );
  server.get("/timeLeft", async (_request, reply) => {
    await reply.type("text/plain").send(`${shutdownControl().timeLeft()}\n`);
  });
  server.get(
    "/shutdown",
    mutation(async (_request, reply) => {
      await shutdownControl().schedule();
      await reply.type("text/plain").send("success\n");
    }),
  );
  server.get(
    "/cancel",
    mutation(async (_request, reply) => {
      await shutdownControl().cancel();
      await reply.type("text/plain").send("success\n");
    }),
  );
  server.get("/gracefulRestart", async (_request, reply) => {
    shutdownControl().requestStop(true);
    await reply.type("text/plain").send("success\n");
  });
  server.get("/getLongTables", async (_request, reply) => {
    const lines = ["Long tables:"];
    for (const id of getTableIDs()) {
      const table = getTable(id);
      if (
        table !== undefined
        && Date.now() - table.datetimeCreated.getTime() >= 150 * 60 * 1000
      ) {
        lines.push(`${lines.length}) Table ID: ${id}, Name: ${table.name}`);
      }
    }
    await reply.type("text/plain").send(`${lines.join("\n")}\n`);
  });
  server.get("/saveTables", async (_request, reply) => {
    await reply
      .code(410)
      .type("text/plain")
      .send(
        "Emergency table saves are retired; no save was performed. Accepted progress uses continuous PostgreSQL recovery. Use /gracefulRestart for planned maintenance or recovery of frozen tables.\n",
      );
  });
  server.get("/print", async (_request, reply) => {
    const tables = getTableIDs().map((id) => {
      const table = getTable(id);
      return {
        id,
        name: table?.name,
        running: table?.running,
        replay: table?.replay,
      };
    });
    logger.debug(
      { users: getUserList(), tables },
      "Current application state.",
    );
    await reply.type("text/plain").send("success\n");
  });
  server.get(
    "/debugFunction",
    mutation(async (_request, reply) => {
      logger.debug("Debug functions complete; no manual repair is enabled.");
      await reply.type("text/plain").send("success\n");
    }),
  );
  return await server;
}

async function userAction(
  action: "ban" | "mute" | "sendWarning" | "sendError",
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const parsed = z
    .object({
      username: z.string().min(1),
      msg: z.string().optional(),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    await reply.code(400).send("Error: You must specify a username.\n");
    return;
  }
  const { username, msg } = parsed.data;
  if (action === "ban" || action === "mute") {
    const result = await models.moderation.set(action, username);
    if (result === undefined) {
      await reply
        .type("text/plain")
        .send(`User "${username}" does not exist in the database.\n`);
    } else if (result.inserted) {
      wsUsers.get(result.userID)?.connection.close();
      logger.info(
        { userID: result.userID, action },
        "Applied account IP moderation.",
      );
      await reply.type("text/plain").send("success\n");
    } else {
      await reply
        .type("text/plain")
        .send(
          `User "${result.username}" has an IP of "${result.ip}", but it is already ${action === "ban" ? "banned" : "muted"}.\n`,
        );
    }
    return;
  }
  if (msg === undefined || msg === "") {
    await reply.code(400).send('You must send a "msg" POST parameter.\n');
    return;
  }
  const account = await models.users.getByNormalizedUsername(
    normalizeString(username),
  );
  if (account === undefined) {
    await reply
      .type("text/plain")
      .send(`User "${username}" does not exist in the database.\n`);
    return;
  }
  const user = wsUsers.get(account.id);
  if (user === undefined) {
    await reply
      .code(500)
      .send(`Failed to get the session for the user ID of "${account.id}".`);
    return;
  }
  if (action === "sendWarning") {
    wsWarning(user.connection, msg);
  } else {
    wsError(user.connection, msg);
  }
  await reply.type("text/plain").send("success\n");
}

async function terminate(request: FastifyRequest, reply: FastifyReply) {
  const input = z.object({ tableID: z.string().min(1) });
  const body = input.safeParse(request.body);
  const query = input.safeParse(request.query);
  const parsed = body.success ? body : query;
  if (!parsed.success) {
    await reply
      .code(400)
      .send("Error: You must specify a table name or a table ID.\n");
    return;
  }
  const identifier = parsed.data.tableID;
  const numeric = /^\d+$/u.test(identifier) ? Number(identifier) : undefined;
  const id =
    numeric !== undefined && Number.isSafeInteger(numeric)
      ? (numeric as TableID)
      : getTableIDs().find(
          (candidate) => getTable(candidate)?.name === identifier,
        );
  if (id === undefined || getTable(id) === undefined) {
    await reply
      .type("text/plain")
      .send(`Table "${identifier}" does not exist.\n`);
    return;
  }
  const runtime = getGameRuntime();
  if (runtime === undefined) {
    throw new Error("Game runtime is not initialized.");
  }
  if (!(await runtime.terminateByServer(id))) {
    await reply.code(400).send("That table is not an ongoing game.\n");
    return;
  }
  await reply.type("text/plain").send("success\n");
}

async function metrics(_request: FastifyRequest, reply: FastifyReply) {
  const memory = process.memoryUsage();
  const recovery = {
    ...getRecoveryMetrics(),
    storageInitialized: getGameRuntime() !== undefined,
    frozenTables: getTableIDs().filter(
      (id) => getTable(id)?.recoveryBlocked === true,
    ).length,
  };
  const report = {
    uptimeSeconds: getUptimeSeconds(),
    draining: incomingCommands.paused,
    maintenanceMode: isMaintenanceMode(),
    discord: getDiscordBridge()?.status ?? "disabled",
    runtime: {
      heapBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      residentBytes: memory.rss,
      externalBytes: memory.external,
      activeResourceCount: process.getActiveResourcesInfo().length,
    },
    commands: commandMetrics.snapshot(),
  };
  try {
    const database = await getDatabasePoolReports();
    await reply.send({
      ...report,
      database: database.primary,
      recovery: { ...recovery, database: database.recovery },
    });
  } catch (error) {
    logger.error(`Database metrics unavailable: ${String(error)}`);
    await reply.code(503).send({
      ...report,
      recovery,
      database: { error: "Database pool activity is unavailable." },
    });
  }
}
