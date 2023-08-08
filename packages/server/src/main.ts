import Fastify from "fastify";

main().catch((error) => {
  throw new Error(`Failed to create a rule: ${error}`);
});

async function main() {
  // eslint-disable-next-line new-cap
  const fastify = Fastify({
    logger: true,
  });

  // Declare a route
  fastify.get("/", async (_request, _reply) => "HII");

  await fastify.listen({ port: 3000 });
}
