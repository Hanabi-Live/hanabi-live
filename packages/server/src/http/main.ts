import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env";
import { getTemplateVariables } from "../httpUtils";
import type { TemplateVariables } from "../interfaces/TemplateVariables";

export function httpMain(
  _request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  return reply.view("main", {
    ...getTemplateVariables(),
    title: "Main",
    domain: env.DOMAIN,
  } satisfies TemplateVariables);
}
