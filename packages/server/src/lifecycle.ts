import type { FastifyInstance } from "fastify";
import { incomingCommands } from "./commandAdmission";
import type { GameRuntime } from "./gameRuntime";
import { wsError } from "./wsHelpers";

interface ClosingServer {
  readonly websocketServer: Pick<FastifyInstance["websocketServer"], "clients">;
  close: () => Promise<void>;
}

export async function shutdownServer(
  runtime: Pick<GameRuntime, "quiesce" | "checkpointAndDrain" | "close">,
  server: ClosingServer,
  closeDatabase: () => Promise<void>,
): Promise<void> {
  incomingCommands.pause();
  runtime.quiesce();
  await incomingCommands.drain();
  await runtime.checkpointAndDrain();

  for (const connection of server.websocketServer.clients) {
    wsError(
      connection,
      "The server is going down for maintenance. Your accepted game progress has been saved.<br />Please reconnect after the server restarts.",
    );
    connection.close(1012, "Server maintenance");
  }
  const timeout = setTimeout(() => {
    for (const connection of server.websocketServer.clients) {
      connection.terminate();
    }
  }, 1000);
  timeout.unref();
  try {
    await server.close();
  } finally {
    clearTimeout(timeout);
  }
  await runtime.close();
  await closeDatabase();
}
