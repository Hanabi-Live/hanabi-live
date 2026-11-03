import { fastifyCompress } from "@fastify/compress";
import fastifyFormBody from "@fastify/formbody";
import { fastifyStatic } from "@fastify/static";
import { fastifyView } from "@fastify/view";
import fastifyWebSocket from "@fastify/websocket";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { fastify } from "fastify";
import { fastifyFavicon } from "fastify-favicon";
import { StatusCodes } from "http-status-codes";
import fs from "node:fs";
import { STATUS_CODES } from "node:http";
import path from "node:path";
import { HTTP_TIMEOUTS, REPO_ROOT } from "./constants";
import { IS_DEV, env } from "./env";
import { createEta } from "./eta";
import { getHTTPErrorStatus } from "./http/httpError";
import { httpExport } from "./http/httpExport";
import {
  httpAPIHistory,
  httpAPIHistoryFull,
  httpAPISeed,
  httpAPISeedFull,
  httpAPIVariantGames,
  httpAPIVariants,
  httpAPIVariantsFull,
} from "./http/httpGameAPI";
import {
  httpIdentityLookup,
  httpIdentityTokenGet,
  httpIdentityTokenPost,
} from "./http/httpIdentity";
import { httpLogin } from "./http/httpLogin";
import { httpLogout } from "./http/httpLogout";
import { httpMain } from "./http/httpMain";
import { registerPublicPages } from "./http/httpPublicPages";
import { httpSharedMissingScores } from "./http/httpSharedMissingScores";
import { httpAPITags } from "./http/httpTags";
import { httpAPITagSearch } from "./http/httpTagSearch";
import { httpTestCookie } from "./http/httpTestCookie";
import { httpWS, httpWSPreValidation } from "./http/httpWS";
import { registerHTTPSessions } from "./httpSession";
import { logger } from "./logger";
import { models } from "./models";

/**
 * The Let's Encrypt certbot will request a token from this path:
 * https://letsencrypt.org/docs/challenge-types/
 */
const LETS_ENCRYPT_PATH_PREFIX = "/.well-known/acme-challenge/";

const LETS_ENCRYPT_PATH = path.join(
  REPO_ROOT,
  "letsencrypt",
  LETS_ENCRYPT_PATH_PREFIX,
);

const eta = createEta();

export async function httpInit(): Promise<FastifyInstance> {
  const host =
    env.DOMAIN === "localhost" || env.DOMAIN === "127.0.0.1"
      ? "127.0.0.1"
      : "0.0.0.0";
  const useTLS = env.TLS_CERT_FILE !== "" && env.TLS_KEY_FILE !== "";
  let server: FastifyInstance | undefined;
  let redirect: FastifyInstance | undefined;
  try {
    if (useTLS) {
      fs.mkdirSync(LETS_ENCRYPT_PATH, { recursive: true });
      redirect = await createHTTPRedirectServer(LETS_ENCRYPT_PATH);
    }
    server = await createHTTPServer(async () => {
      await redirect?.close();
    });
    await redirect?.listen({ port: 80, host });
    await server.listen({
      port: useTLS && env.PORT === 80 ? 443 : env.PORT,
      host,
    });
    return server;
  } catch (error) {
    try {
      if (server === undefined) {
        await redirect?.close();
      } else {
        await server.close();
      }
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "HTTP startup and cleanup failed.",
        { cause: cleanupError },
      );
    }
    throw error;
  }
}

export async function createHTTPRedirectServer(
  acmeRoot: string,
): Promise<FastifyInstance> {
  const server = fastify(HTTP_TIMEOUTS);
  server.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith(LETS_ENCRYPT_PATH_PREFIX)) {
      await reply.redirect(
        `https://${request.host}${request.url}`,
        StatusCodes.MOVED_PERMANENTLY,
      );
    }
  });
  await server.register(fastifyStatic, {
    root: acmeRoot,
    prefix: LETS_ENCRYPT_PATH_PREFIX,
  });
  return await server;
}

export async function createHTTPServer(
  onClose?: () => Promise<void>,
): Promise<FastifyInstance> {
  const useTLS = env.TLS_CERT_FILE !== "" && env.TLS_KEY_FILE !== "";
  if ((env.TLS_CERT_FILE !== "") !== (env.TLS_KEY_FILE !== "")) {
    throw new Error("TLS_CERT_FILE and TLS_KEY_FILE must both be provided.");
  }
  const https = useTLS
    ? {
        cert: fs.readFileSync(env.TLS_CERT_FILE),
        key: fs.readFileSync(env.TLS_KEY_FILE),
        ...HTTP_TIMEOUTS.http,
      }
    : null; // eslint-disable-line unicorn/no-null

  // Fastify's types only accept a logger that is typed as the base logger interface.
  const loggerInstance: FastifyBaseLogger = logger;

  // Initialize the HTTP server using the Fastify library:
  // https://fastify.dev/
  const httpServer = fastify({
    ...HTTP_TIMEOUTS,
    loggerInstance,
    https,

    // The "incoming request" and "request completed" logs are too noisy when developing.
    disableRequestLogging: IS_DEV,
  });
  if (onClose !== undefined) {
    httpServer.addHook("onClose", onClose);
  }

  await registerFastifyPlugins(httpServer, useTLS);

  httpServer.setNotFoundHandler(async (_request, reply) => {
    await reply
      .code(StatusCodes.NOT_FOUND)
      .type("text/html")
      .send("404 not found");
  });

  httpServer.setErrorHandler(async (error, _request, reply) => {
    logger.error(`HTTP request failed: ${String(error)}`);
    const status = getHTTPErrorStatus(error);
    await reply
      .code(status)
      .type("text/plain")
      .send(
        status === 500
          ? "Internal server error."
          : `${STATUS_CODES[status] ?? "Request rejected"}.`,
      );
  });

  httpServer.addHook("preValidation", async (request, reply) => {
    const isAPI = request.routeOptions.url?.startsWith("/api/v1/") === true;
    if (
      request.routeOptions.url !== "/login"
      && request.routeOptions.url !== "/ws"
      && !isAPI
    ) {
      return;
    }
    const { ip } = request;

    if (await models.bannedIPs.check(ip)) {
      logger.info(
        `IP "${request.ip}" tried to send an HTTP request, but they are banned.`,
      );
      const message =
        "Your IP address has been banned. Please contact an administrator if you think this is a mistake.";
      return await reply
        .code(isAPI ? StatusCodes.BAD_REQUEST : StatusCodes.UNAUTHORIZED)
        .type(isAPI ? "application/json" : "text/plain")
        .send(isAPI ? JSON.stringify(message) : message);
    }
  });

  registerPathHandlers(httpServer);

  return await httpServer;
}

/** Plugins are registered in alphabetical order. */
async function registerFastifyPlugins(
  httpServer: FastifyInstance,
  useTLS: boolean,
) {
  await httpServer.register(fastifyCompress, {
    encodings: ["gzip"],
    globalDecompression: false,
    threshold: 0,
  });
  // `fastify-favicon` - Needed for the favicon:
  // https://github.com/smartiniOnGitHub/fastify-favicon
  await httpServer.register(fastifyFavicon, {
    // The plugin appends "favicon.ico" to the provided path.
    path: path.join(REPO_ROOT, "public", "img"),
  });

  // `@fastify/formbody` - Needed for "application/x-www-form-urlencoded" POST data:
  // https://github.com/fastify/fastify-formbody
  await httpServer.register(fastifyFormBody);

  await registerHTTPSessions(httpServer, useTLS);

  // `@fastify/websocket` - Needed for WebSockets.
  await httpServer.register(fastifyWebSocket, {
    options: {
      maxPayload: 8192,
    },
  });

  // `@fastify/static` - Needed to serve static files:
  // https://github.com/fastify/fastify-static
  await httpServer.register(fastifyStatic, {
    root: path.join(REPO_ROOT, "public"),
    prefix: "/public",
  });

  // `@fastify/view` - Needed for the template library:
  // https://github.com/fastify/point-of-view
  await httpServer.register(fastifyView, {
    engine: {
      eta,
    },
    templates: path.join(__dirname, "templates"),
  });
}

function registerPathHandlers(httpServer: FastifyInstance) {
  registerPublicPages(httpServer);
  // For cookies and logging in.
  httpServer.post("/login", httpLogin);
  httpServer.get("/logout", httpLogout);
  httpServer.get("/test-cookie", httpTestCookie);
  httpServer.get(
    "/ws",
    {
      websocket: true,
      preValidation: httpWSPreValidation,
    },
    httpWS,
  );

  // For the main website.
  httpServer.get("/", httpMain);
  httpServer.get("/lobby", httpMain);
  httpServer.get("/new", (_request, reply) =>
    reply
      .header("Cache-Control", "no-cache")
      .sendFile("client-new/index.html", { cacheControl: false }),
  );
  httpServer.get("/new/*", (_request, reply) =>
    reply
      .header("Cache-Control", "no-cache")
      .sendFile("client-new/index.html", { cacheControl: false }),
  );
  httpServer.get("/pre-game", httpMain);
  httpServer.get("/pre-game/:tableID", httpMain);
  httpServer.get("/game", httpMain);
  httpServer.get("/game/:tableID", httpMain);
  httpServer.get("/game/:tableID/shadow/:seat", httpMain);
  httpServer.get("/replay", httpMain);
  httpServer.get("/replay/:databaseID", httpMain);
  httpServer.get("/replay/:databaseID/:turnID", httpMain);
  httpServer.get("/shared-replay", httpMain);
  httpServer.get("/shared-replay/:databaseID", httpMain);
  httpServer.get("/shared-replay/:databaseID/:turnID", httpMain);
  httpServer.get("/replay-json/:string", httpMain);
  httpServer.get("/shared-replay-json/:string", httpMain);
  httpServer.get("/create-table", httpMain);

  // For the "Missing Scores" page of multiple players. The player names are in the path, e.g.
  // "/shared-missing-scores/3/Alice/Bob/Cathy".
  let sharedMissingScoresPath = "/shared-missing-scores/:numPlayers";
  httpServer.get(sharedMissingScoresPath, httpSharedMissingScores);
  for (let i = 1; i <= 6; i++) {
    sharedMissingScoresPath += `/:player${i}`;
    httpServer.get(sharedMissingScoresPath, httpSharedMissingScores);
  }

  // API V1 routes.
  const api = "/api/v1";
  httpServer.get(`${api}/variants`, httpAPIVariants);
  httpServer.get(`${api}/variants-full`, httpAPIVariantsFull);
  httpServer.get(`${api}/variants/:id`, httpAPIVariantGames);
  httpServer.get(`${api}/seed/:seed`, httpAPISeed);
  httpServer.get(`${api}/seed-full/:seed`, httpAPISeedFull);
  let historyPath = `${api}/history`;
  let fullHistoryPath = `${api}/history-full`;
  for (let index = 1; index <= 6; index++) {
    historyPath += `/:player${index}`;
    fullHistoryPath += `/:player${index}`;
    httpServer.get(historyPath, httpAPIHistory);
    httpServer.get(fullHistoryPath, httpAPIHistoryFull);
  }
  httpServer.get(`${api}/tags/:player1`, httpAPITags);
  httpServer.get(`${api}/tag/:tag`, httpAPITagSearch);
  httpServer.get(`${api}/identity/token`, httpIdentityTokenGet);
  httpServer.post(`${api}/identity/token`, httpIdentityTokenPost);
  httpServer.post(`${api}/identity`, httpIdentityLookup);
  httpServer.get("/export", httpExport);
  httpServer.get("/export/:databaseID", httpExport);

  // The legacy global /stats page remains disabled for maintenance.
}
