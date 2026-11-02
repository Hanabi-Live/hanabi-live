import fastifyFormBody from "@fastify/formbody";
import { fastifyStatic } from "@fastify/static";
import { fastifyView } from "@fastify/view";
import fastifyWebSocket from "@fastify/websocket";
import type { FastifyBaseLogger, FastifyInstance } from "fastify";
import { fastify } from "fastify";
import { fastifyFavicon } from "fastify-favicon";
import { StatusCodes } from "http-status-codes";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./constants";
import { IS_DEV, env } from "./env";
import { createEta } from "./eta";
import {
  httpIdentityLookup,
  httpIdentityTokenGet,
  httpIdentityTokenPost,
} from "./http/httpIdentity";
import { httpLogin } from "./http/httpLogin";
import { httpLogout } from "./http/httpLogout";
import { httpMain } from "./http/httpMain";
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
const LETS_ENCRYPT_PATH_PREFIX = "/letsencrypt/.well-known/acme-challenge";

const LETS_ENCRYPT_PATH = path.join(REPO_ROOT, LETS_ENCRYPT_PATH_PREFIX);

const eta = createEta();

export async function httpInit(): Promise<FastifyInstance> {
  const useTLS = env.TLS_CERT_FILE !== "" && env.TLS_KEY_FILE !== "";
  const defaultPort = useTLS ? 443 : 80;
  const port = env.PORT === 0 ? defaultPort : env.PORT;
  const server = await createHTTPServer();
  await server.listen({ port, host: "0.0.0.0" });
  return server;
}

export async function createHTTPServer(): Promise<FastifyInstance> {
  const useTLS = env.TLS_CERT_FILE !== "" && env.TLS_KEY_FILE !== "";
  if ((env.TLS_CERT_FILE !== "") !== (env.TLS_KEY_FILE !== "")) {
    throw new Error("TLS_CERT_FILE and TLS_KEY_FILE must both be provided.");
  }
  const https = useTLS
    ? {
        cert: fs.readFileSync(env.TLS_CERT_FILE),
        key: fs.readFileSync(env.TLS_KEY_FILE),
      }
    : null; // eslint-disable-line unicorn/no-null

  // Fastify's types only accept a logger that is typed as the base logger interface.
  const loggerInstance: FastifyBaseLogger = logger;

  // Initialize the HTTP server using the Fastify library:
  // https://fastify.dev/
  const httpServer = fastify({
    loggerInstance,
    https,

    // The "incoming request" and "request completed" logs are too noisy when developing.
    disableRequestLogging: IS_DEV,
  });

  await registerFastifyPlugins(httpServer, useTLS);

  httpServer.setNotFoundHandler(async (_request, reply) => {
    await reply
      .code(StatusCodes.NOT_FOUND)
      .type("text/html")
      .send("404 not found");
  });

  httpServer.setErrorHandler(async (error, _request, reply) => {
    logger.error(`HTTP request failed: ${String(error)}`);
    await reply
      .code(StatusCodes.INTERNAL_SERVER_ERROR)
      .type("text/plain")
      .send("Internal server error.");
  });

  httpServer.addHook("preValidation", async (request, reply) => {
    if (
      request.routeOptions.url !== "/login"
      && request.routeOptions.url !== "/ws"
    ) {
      return;
    }
    const { ip } = request;

    if (await models.bannedIPs.check(ip)) {
      logger.info(
        `IP "${request.ip}" tried to send an HTTP request, but they are banned.`,
      );
      return await reply
        .code(StatusCodes.UNAUTHORIZED)
        .send(
          "Your IP address has been banned. Please contact an administrator if you think this is a mistake.",
        );
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

  // Handle renewing HTTPS certificates through `certbot`:
  // https://letsencrypt.org/docs/challenge-types/
  if (useTLS) {
    fs.mkdirSync(LETS_ENCRYPT_PATH, {
      recursive: true,
    });

    await httpServer.register(fastifyStatic, {
      root: LETS_ENCRYPT_PATH,
      prefix: LETS_ENCRYPT_PATH_PREFIX,
      decorateReply: false,
    });
  }

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
  httpServer.get("/pre-game", httpMain);
  httpServer.get("/pre-game/:tableID", httpMain);
  httpServer.get("/game", httpMain);
  httpServer.get("/game/:tableID", httpMain);
  httpServer.get("/game/:tableID/shadow/:seat", httpMain);
  httpServer.get("/replay", httpMain);
  httpServer.get("/replay/:databaseID", httpMain);
  httpServer.get("/shared-replay", httpMain);
  httpServer.get("/shared-replay/:databaseID", httpMain);
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
  httpServer.get(`${api}/tags/:player1`, httpAPITags);
  httpServer.get(`${api}/tag/:tag`, httpAPITagSearch);
  httpServer.get(`${api}/identity/token`, httpIdentityTokenGet);
  httpServer.post(`${api}/identity/token`, httpIdentityTokenPost);
  httpServer.post(`${api}/identity`, httpIdentityLookup);

  /*

	// Path handlers for other URLs
	fastify.get("/scores", httpScores)
	fastify.get("/scores/:player1", httpScores)
	fastify.get("/profile", httpScores) // "/profile" is an alias for "/scores"
	fastify.get("/profile/:player1", httpScores)
	fastify.get("/history", httpHistory)
	fastify.get("/history/:player1", httpHistory)
	fastify.get("/history/:player1/:player2", httpHistory)
	fastify.get("/history/:player1/:player2/:player3", httpHistory)
	fastify.get("/history/:player1/:player2/:player3/:player4", httpHistory)
	fastify.get("/history/:player1/:player2/:player3/:player4/:player5", httpHistory)
	fastify.get("/history/:player1/:player2/:player3/:player4/:player5/:player6", httpHistory)
	fastify.get("/missing-scores", httpMissingScores)
	fastify.get("/missing-scores/:player1", httpMissingScores)
	fastify.get("/missing-scores/:player1/:numPlayers", httpMissingScores)
	fastify.get("/tags", httpTags)
	fastify.get("/tags/:player1", httpTags)
	fastify.get("/seed", httpSeed)
	fastify.get("/seed/:seed", httpSeed) // Display all games played on a given seed
	// fastify.get("/stats", httpStats)
	fastify.get("/variant", httpVariant)
	fastify.get("/variant/:id", httpVariant)
	fastify.get("/tag", httpTag)
	fastify.get("/tag/:tag", httpTag)
	fastify.get("/videos", httpVideos)
	fastify.get("/password-reset", httpPasswordReset)
	httpRouter.POST("/password-reset", httpPasswordResetPost)

	// API V1 routes
	apiSetRoutes(httpRouter)

	// Path handlers for bots, developers, researchers, etc.
	fastify.get("/export", httpExport)
	fastify.get("/export/:databaseID", httpExport)

  */
}
