import fastifyCookie from "@fastify/cookie";
import type { CookieOptions } from "@fastify/session";
import fastifySession from "@fastify/session";
import fastifyStatic from "@fastify/static";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import Fastify from "fastify";
import fs from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import { REPO_ROOT } from "./constants";
import { IS_DEV, env } from "./env";
import { logger } from "./logger";

type FastifyInstanceWithLogger = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  Logger
>;

const HTTP_SESSION_NAME = "hanabi.sid";

const COOKIE_OPTIONS_BASE = {
  /** The cookie should apply to the entire domain. */
  path: "/",

  /** 1 year in seconds. */
  maxAge: 60 * 60 * 24 * 365,
} as const satisfies CookieOptions;

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
} as const satisfies CookieOptions;

const COOKIE_OPTIONS = IS_DEV ? COOKIE_OPTIONS_BASE : COOKIE_OPTIONS_PRODUCTION;

/**
 * The Let's Encrypt certbot will request a token from this path:
 * https://letsencrypt.org/docs/challenge-types/
 */
const LETS_ENCRYPT_PATH_PREFIX = "/letsencrypt/.well-known/acme-challenge";

const LETS_ENCRYPT_PATH = path.join(REPO_ROOT, LETS_ENCRYPT_PATH_PREFIX);

export async function httpInit(): Promise<void> {
  const useTLS = env.TLS_CERT_FILE !== "" && env.TLS_KEY_FILE !== "";
  const defaultPort = useTLS ? 443 : 80;
  const port = env.PORT === 0 ? defaultPort : env.PORT;

  // Initialize the HTTP server using the Fastify library:
  // https://fastify.dev/
  // eslint-disable-next-line new-cap
  const fastify = Fastify({
    logger,
  });

  // Initialize session management through the `@fastify/session` plugin:
  // https://github.com/fastify/session
  await fastify.register(fastifyCookie);
  await fastify.register(fastifySession, {
    secret: env.SESSION_SECRET,
    cookieName: HTTP_SESSION_NAME,
    cookie: COOKIE_OPTIONS,
  });
  fastify.addHook("preHandler", preHandler);

  // Initialize static file serving through the `@fastify/static` plugin:
  // https://github.com/fastify/fastify-static
  await fastify.register(fastifyStatic, {
    root: path.join(REPO_ROOT, "public"),
    prefix: "/public",
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

function preHandler(
  _request: FastifyRequest,
  _reply: FastifyReply,
  done: HookHandlerDoneFunction,
) {
  // TODO: authentication
  /// request.session.user = { name: "max" };
  done();
}

function registerPathHandlers(fastify: FastifyInstanceWithLogger) {
  fastify.get("/", async (_request, _reply) => "HI");

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

	// Other
	httpRouter.Static("/public", path.Join(projectPath, "public"))
	httpRouter.StaticFile("/favicon.ico", path.Join(projectPath, "public", "img", "favicon.ico"))

  */
}
