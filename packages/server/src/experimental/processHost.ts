// IPC-only evaluation child. This is not a public server entry point or a production session
// bridge.
import process from "node:process";
import { z } from "zod";
import {
  evaluationConnectionSchema,
  evaluationPool,
} from "./evaluationSupport";
import { startHost } from "./host";
import { winningDeck } from "./scenarios";
import { openStore } from "./store";

const initialization = z.strictObject({
  connection: evaluationConnectionSchema,
});

process.once("message", (input: unknown) => {
  start(input).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
    process.disconnect?.();
  });
});

async function start(input: unknown) {
  const { connection } = initialization.parse(input);
  const store = await openStore(evaluationPool(connection));
  const host = await startHost(store, winningDeck);
  process.once("disconnect", () => {
    host.close().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  });
  process.send?.({
    url: host.url,
    aliceToken: host.session("Alice"),
    bobToken: host.session("Bob"),
  });
  process.once("message", (message: unknown) => {
    if (message !== "shutdown") {
      throw new Error("Unsupported evaluation process command.");
    }
    host
      .close()
      .then(() => {
        process.disconnect?.();
      })
      .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
        process.disconnect?.();
      });
  });
}
