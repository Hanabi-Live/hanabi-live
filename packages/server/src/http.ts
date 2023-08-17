import type { SecureSessionPluginOptions } from "@fastify/secure-session";
import fastifySecureSession from "@fastify/secure-session";
import fastifyStatic from "@fastify/static";
import fastifyView from "@fastify/view";
import { PROJECT_NAME } from "@hanabi/data";
import { Eta } from "eta";
import type {
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import Fastify from "fastify";
import fastifyFavicon from "fastify-favicon";
import fs from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import { REPO_ROOT } from "./constants";
import { IS_DEV, env } from "./env";
import { logger } from "./logger";
import { getVersion } from "./version";

type FastifyInstanceWithLogger = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  Logger
>;

interface TemplateVariables {
  // From the `getTemplateVariables` function.
  projectName: string;
  isDev: boolean;
  version: number;

  // Needed by all templates.
  title: string;

  // Needed by the "main" template.
  domain?: string;
}

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
});

export async function httpInit(): Promise<void> {
  const useTLS = env.TLS_CERT_FILE !== "" && env.TLS_KEY_FILE !== "";
  const defaultPort = useTLS ? 443 : 80;
  const port = env.PORT === 0 ? defaultPort : env.PORT;

  // Initialize the HTTP server using the Fastify library:
  // https://fastify.dev/
  // eslint-disable-next-line new-cap
  const fastify = Fastify({
    logger,

    // The "incoming request" and "request completed" logs are too noisy when developing.
    disableRequestLogging: IS_DEV,
  });

  // Initialize the template library through the `@fastify/view` plugin:
  // https://github.com/fastify/point-of-view
  await fastify.register(fastifyView, {
    engine: {
      eta,
    },
    templates: path.join(__dirname, "templates"),
  });

  // Initialize session management through the `@fastify/secure-session` plugin:
  // https://github.com/fastify/fastify-secure-session/tree/master
  // (The `@fastify/session` plugin is used for server-side data storage.)
  await fastify.register(fastifySecureSession, {
    cookieName: COOKIE_NAME,
    secret: env.SESSION_SECRET,
    salt: "hanabiSalt123456", // Must be 16 characters long.
    cookie: COOKIE_OPTIONS,
  });

  // Initialize static file serving through the `@fastify/static` plugin:
  // https://github.com/fastify/fastify-static
  await fastify.register(fastifyStatic, {
    root: path.join(REPO_ROOT, "public"),
    prefix: "/public",
  });

  // Initialize favicon serving through the `fastify-favicon` plugin:
  // https://github.com/smartiniOnGitHub/fastify-favicon
  await fastify.register(fastifyFavicon, {
    // The plugin appends "favicon.ico" to the provided path.
    path: path.join(REPO_ROOT, "public", "img"),
  });

  // Handle renewing HTTPS certificates through `certbot`:
  // https://letsencrypt.org/docs/challenge-types/
  if (useTLS) {
    fs.mkdirSync(LETS_ENCRYPT_PATH, {
      recursive: true,
    });

    await fastify.register(fastifyStatic, {
      root: LETS_ENCRYPT_PATH,
      prefix: LETS_ENCRYPT_PATH_PREFIX,
    });
  }

  registerPathHandlers(fastify);

  await fastify.listen({
    port,
  });
}

function registerPathHandlers(fastify: FastifyInstanceWithLogger) {
  fastify.setNotFoundHandler(async (_request, reply) => {
    // TODO: custom 404 page
    await reply.code(404).type("text/html").send("404 not found");
  });

  fastify.setErrorHandler(async (error, _request, reply) => {
    // TODO: custom 500 page
    await reply
      .code(500)
      .type("text/html")
      .send(`<pre>${error.stack ?? error.message}</pre>`);
  });

  fastify.get("/", (_request, reply) =>
    reply.view("main", {
      ...getTemplateVariables(),
      title: "Main",
      domain: env.DOMAIN,
    } satisfies TemplateVariables),
  );

  /*

 	// Path handlers (for cookies and logging in)
	httpRouter.POST("/login", httpLogin)
	httpRouter.GET("/logout", httpLogout)
	httpRouter.GET("/test-cookie", httpTestCookie)
	httpRouter.GET("/ws", httpWS)

	// Path handlers (for the main website)
	httpRouter.GET("/", httpMain)
	httpRouter.GET("/lobby", httpMain)
	httpRouter.GET("/pre-game", httpMain)
	httpRouter.GET("/pre-game/:tableID", httpMain)
	httpRouter.GET("/game", httpMain)
	httpRouter.GET("/game/:tableID", httpMain)
	httpRouter.GET("/game/:tableID/shadow/:seat", httpMain)
	httpRouter.GET("/replay", httpMain)
	httpRouter.GET("/replay/:databaseID", httpMain)
	httpRouter.GET("/replay/:databaseID/:turnID", httpMain) // Deprecated; needed for older links to work
	httpRouter.GET("/shared-replay", httpMain)
	httpRouter.GET("/shared-replay/:databaseID", httpMain)
	httpRouter.GET("/shared-replay/:databaseID/:turnID", httpMain) // Deprecated; needed for older links to work
	httpRouter.GET("/replay-json/:string", httpMain)
	httpRouter.GET("/shared-replay-json/:string", httpMain)
	httpRouter.GET("/create-table", httpMain)

	// Path handlers for other URLs
	httpRouter.GET("/scores", httpScores)
	httpRouter.GET("/scores/:player1", httpScores)
	httpRouter.GET("/profile", httpScores) // "/profile" is an alias for "/scores"
	httpRouter.GET("/profile/:player1", httpScores)
	httpRouter.GET("/history", httpHistory)
	httpRouter.GET("/history/:player1", httpHistory)
	httpRouter.GET("/history/:player1/:player2", httpHistory)
	httpRouter.GET("/history/:player1/:player2/:player3", httpHistory)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4", httpHistory)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4/:player5", httpHistory)
	httpRouter.GET("/history/:player1/:player2/:player3/:player4/:player5/:player6", httpHistory)
	httpRouter.GET("/missing-scores", httpMissingScores)
	httpRouter.GET("/missing-scores/:player1", httpMissingScores)
	httpRouter.GET("/missing-scores/:player1/:numPlayers", httpMissingScores)
	httpRouter.GET("/shared-missing-scores/:numPlayers", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:numPlayers/:player1", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:numPlayers/:player1/:player2", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:numPlayers/:player1/:player2/:player3", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:numPlayers/:player1/:player2/:player3/:player4", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:numPlayers/:player1/:player2/:player3/:player4/:player5", httpSharedMissingScores)
	httpRouter.GET("/shared-missing-scores/:numPlayers/:player1/:player2/:player3/:player4/:player5/:player6", httpSharedMissingScores)
	httpRouter.GET("/tags", httpTags)
	httpRouter.GET("/tags/:player1", httpTags)
	httpRouter.GET("/seed", httpSeed)
	httpRouter.GET("/seed/:seed", httpSeed) // Display all games played on a given seed
	httpRouter.GET("/stats", httpStats)
	httpRouter.GET("/variant", httpVariant)
	httpRouter.GET("/variant/:id", httpVariant)
	httpRouter.GET("/tag", httpTag)
	httpRouter.GET("/tag/:tag", httpTag)
	httpRouter.GET("/videos", httpVideos)
	httpRouter.GET("/password-reset", httpPasswordReset)
	httpRouter.POST("/password-reset", httpPasswordResetPost)

	// API V1 routes
	apiSetRoutes(httpRouter)

	// Path handlers for bots, developers, researchers, etc.
	httpRouter.GET("/export", httpExport)
	httpRouter.GET("/export/:databaseID", httpExport)

  */
}

/**
 * Some variables are used by the "layout.eta" file, meaning that they are needed for every page
 * across the website.
 *
 * This cannot be a constant object because we want the version of the client to be updatable
 * without restarting the server.
 */
function getTemplateVariables() {
  return {
    projectName: PROJECT_NAME,
    isDev: IS_DEV,
    version: getVersion(),
  };
}
