import type {
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import Fastify from "fastify";
import type { Logger } from "pino";
import { env } from "./env";
import { logger } from "./logger";

type FastifyInstanceWithLogger = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  Logger
>;

export async function httpInit(): Promise<void> {
  // eslint-disable-next-line new-cap
  const fastify = Fastify({
    logger,
  });

  registerPathHandlers(fastify);

  const useTLS = env.TLS_CERT_FILE !== "" && env.TLS_KEY_FILE !== "";
  const defaultPort = useTLS ? 443 : 80;
  const port = env.PORT === 0 ? defaultPort : env.PORT;

  await fastify.listen({
    port,
  });
}

function registerPathHandlers(fastify: FastifyInstanceWithLogger) {
  fastify.get("/", async (_request, _reply) => "HI");
}
