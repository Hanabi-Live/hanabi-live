import fastifyFormBody from "@fastify/formbody";
import type { SecureSessionPluginOptions } from "@fastify/secure-session";
import { fastifySecureSession } from "@fastify/secure-session";
import { fastifyStatic } from "@fastify/static";
import { fastifyView } from "@fastify/view";
import fastifyWebSocket from "@fastify/websocket";
import { Eta } from "eta";
import type {
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import { fastify } from "fastify";
import { fastifyFavicon } from "fastify-favicon";
import { StatusCodes } from "http-status-codes";
import fs from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import { isBannedIP } from "./bannedIPs";
import { REPO_ROOT } from "./constants";
import { IS_DEV, env } from "./env";
import { httpLogin } from "./http/httpLogin";
import { httpLogout } from "./http/httpLogout";
import { httpMain } from "./http/httpMain";
import { httpTestCookie } from "./http/httpTestCookie";
import { httpWS } from "./http/httpWS";
import { logger } from "./logger";

type FastifyInstanceWithLogger = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  Logger
>;

const COOKIE_NAME = "hanabi.sid";

const COOKIE_OPTIONS_BASE = {
  /** The cookie should apply to the entire domain. */
  path: "/",

  /** 1 year in seconds. */
  maxAge: 60 * 60 * 24 * 365,
} as const satisfies SecureSessionPluginOptions["cookie"];

const COOKIE_OPTIONS_PRODUCTION = {
  ...COOKIE_OPTIONS_BASE,

  /** Bind the cookie to this specific domain for security purposes. */
  domain: env.DOMAIN,

  /**
   * Only send the cookie over HTTPS:
   * https://www.owasp.org/index.php/Testing_for_cookies_attributes_(OTG-SESS-002)
   */
  secure: true,

  /**
   * Mitigate XSS attacks:
   * https://www.owasp.org/index.php/HttpOnly
   */
  httpOnly: true,

  /**
   * Mitigate CSRF attacks:
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies#SameSite_cookies
   */
  sameSite: "strict",
} as const satisfies SecureSessionPluginOptions["cookie"];

const COOKIE_OPTIONS = IS_DEV ? COOKIE_OPTIONS_BASE : COOKIE_OPTIONS_PRODUCTION;

/**
 * The Let's Encrypt certbot will request a token from this path:
 * https://letsencrypt.org/docs/challenge-types/
 */
const LETS_ENCRYPT_PATH_PREFIX = "/letsencrypt/.well-known/acme-challenge";

const LETS_ENCRYPT_PATH = path.join(REPO_ROOT, LETS_ENCRYPT_PATH_PREFIX);

const eta = new Eta({
  // Prefer the Golang template syntax, which is not the default.
  tags: ["{{", "}}"],

  // By default, Eta will allow undefined values to bubble through to the template. We want to
  // explicitly throw an error in this case. This solution was recommended by Ben Gubler in the
  // Discord server.
  functionHeader: `
    if (it !== undefined) {
      for (const [key, value] of Object.entries(it)) {
        if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          throw new Error('The template value of "' + key + '" has a type of: ' + typeof value);
        }

        if (typeof value === "string" && value.trim() === "") {
          throw new Error('The template value of "' + key + '" is empty.');
        }
      }
    }
  `,
});

export async function httpInit(): Promise<void> {
  const useTLS = env.TLS_CERT_FILE !== "" && env.TLS_KEY_FILE !== "";
  const defaultPort = useTLS ? 443 : 80;
  const port = env.PORT === 0 ? defaultPort : env.PORT;

  const https = useTLS
    ? {
        ca: env.TLS_CERT_FILE,
        key: env.TLS_KEY_FILE,
      }
    : null; // eslint-disable-line unicorn/no-null

  // Initialize the HTTP server using the Fastify library:
  // https://fastify.dev/
  const httpServer = fastify({
    logger,
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
    // Use "||" to handle undefined and an empty string at the same time.
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions, @typescript-eslint/prefer-nullish-coalescing
    const text = error.stack || error.message || "unknown error";

    await reply
      .code(StatusCodes.INTERNAL_SERVER_ERROR)
      .type("text/html")
      .send(`<pre>${text}</pre>`);
  });

  httpServer.addHook("preHandler", async (request, reply) => {
    const { ip } = request;

    if (isBannedIP(ip)) {
      logger.info(
        `IP "${request.ip}" tried to send an HTTP request, but they are banned.`,
      );
      return reply
        .code(StatusCodes.UNAUTHORIZED)
        .send(
          "Your IP address has been banned. Please contact an administrator if you think this is a mistake.",
        );
    }
  });

  registerPathHandlers(httpServer);

  await httpServer.listen({
    port,
  });
}

/** Plugins are registered in alphabetical order. */
async function registerFastifyPlugins(
  httpServer: FastifyInstanceWithLogger,
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

  // `@fastify/secure-session` - Needed for session management:
  // https://github.com/fastify/fastify-secure-session/tree/master
  // (The `@fastify/session` plugin is used for server-side data storage.)
  await httpServer.register(fastifySecureSession, {
    cookieName: COOKIE_NAME,
    secret: env.SESSION_SECRET,
    salt: "hanabiSalt123456", // Must be 16 characters long.
    cookie: COOKIE_OPTIONS,
  });

  // `@fastify/websocket` - Needed for WebSockets.
  await httpServer.register(fastifyWebSocket, {
    options: {
      maxPayload: 123,
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

function registerPathHandlers(httpServer: FastifyInstanceWithLogger) {
  // For cookies and logging in.
  httpServer.post("/login", httpLogin);
  httpServer.get("/logout", httpLogout);
  httpServer.get("/test-cookie", httpTestCookie);
  httpServer.get("/ws", { websocket: true }, httpWS);

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
	fastify.get("/shared-missing-scores/:numPlayers", httpSharedMissingScores)
	fastify.get("/shared-missing-scores/:numPlayers/:player1", httpSharedMissingScores)
	fastify.get("/shared-missing-scores/:numPlayers/:player1/:player2", httpSharedMissingScores)
	fastify.get("/shared-missing-scores/:numPlayers/:player1/:player2/:player3", httpSharedMissingScores)
	fastify.get("/shared-missing-scores/:numPlayers/:player1/:player2/:player3/:player4", httpSharedMissingScores)
	fastify.get("/shared-missing-scores/:numPlayers/:player1/:player2/:player3/:player4/:player5", httpSharedMissingScores)
	fastify.get("/shared-missing-scores/:numPlayers/:player1/:player2/:player3/:player4/:player5/:player6", httpSharedMissingScores)
	fastify.get("/tags", httpTags)
	fastify.get("/tags/:player1", httpTags)
	fastify.get("/seed", httpSeed)
	fastify.get("/seed/:seed", httpSeed) // Display all games played on a given seed
	fastify.get("/stats", httpStats)
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
