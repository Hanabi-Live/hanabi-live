import websocketPlugin from "@fastify/websocket";
import { assertDefined, isArray } from "complete-common";
import { fastify } from "fastify";
import { randomBytes } from "node:crypto";
import type { WebSocket } from "ws";
import { z } from "zod";
import type { Card, SliceEvent } from "./engine";
import {
  applyMove,
  initialEvents,
  initialState,
  playerView,
  RejectedError,
  scrubEvents,
  shuffledDeck,
} from "./engine";
import type { Command, SliceRecord } from "./protocol";
import { commandSchema, creationID, newRecord, replay } from "./protocol";
import type { SliceStore } from "./store";

interface Connection {
  socket: WebSocket;
  user: string;
  tableID: string | undefined;
}
interface SliceHost {
  url: string;
  session: (user: string) => string;
  close: () => Promise<void>;
}

function send(socket: WebSocket, payload: unknown) {
  if (socket.readyState !== socket.OPEN) {
    return;
  }
  if (socket.bufferedAmount > 262_144) {
    socket.terminate();
    return;
  }
  socket.send(JSON.stringify(payload));
}

function view(record: SliceRecord, user: string) {
  const index = record.players.indexOf(user);
  if (index === -1) {
    throw new RejectedError("Only participants may access this table.");
  }
  return {
    tableID: record.id,
    revision: record.revision,
    players: record.players,
    state:
      record.state === undefined
        ? undefined
        : playerView(record.deck, record.state, index),
  };
}

/** Not registered by main.ts. Only the opt-in evaluation harness provisions these test sessions. */
export async function startHost(
  store: SliceStore,
  makeDeck: () => readonly Card[] = shuffledDeck,
): Promise<SliceHost> {
  const app = fastify({ logger: false, bodyLimit: 8192 });
  const tokens = new Map<string, string>();
  const connections = new Set<Connection>();
  const queues = new Map<string, { tail: Promise<void>; depth: number }>();
  const frozen = new Set<string>();
  let draining = false;
  let shutdown: Promise<void> | undefined;
  await app.register(websocketPlugin, { options: { maxPayload: 8192 } });

  function broadcast(record: SliceRecord, events: readonly SliceEvent[]) {
    for (const connection of connections) {
      if (connection.tableID === record.id) {
        const index = record.players.indexOf(connection.user);
        send(connection.socket, {
          type: "update",
          ...view(record, connection.user),
          events: scrubEvents(events, index),
        });
      }
    }
  }

  async function persist(record: SliceRecord, revision: number) {
    try {
      await store.save(record, revision);
    } catch (error) {
      // Even an ambiguous COMMIT must not publish the candidate or accept later commands.
      frozen.add(record.id);
      throw new Error("Experimental checkpoint save failed.", { cause: error });
    }
  }

  async function handle(peer: Connection, command: Command, id: string) {
    const connection = peer;
    if (frozen.has(id)) {
      throw new RejectedError(
        "Table frozen after an unexpected failure; reconstruct the host.",
      );
    }
    let record: SliceRecord | undefined;
    try {
      record = await store.load(id);
    } catch (error) {
      frozen.add(id);
      throw new Error("Experimental checkpoint load failed.", { cause: error });
    }
    if (command.type === "create" && record === undefined) {
      try {
        record = newRecord(connection.user, command, makeDeck());
      } catch (error) {
        throw new Error("Experimental initial conditions failed.", {
          cause: error,
        });
      }
      await persist(record, 0);
      connection.tableID = id;
      send(connection.socket, {
        type: "ok",
        requestID: command.requestID,
        ...view(record, connection.user),
      });
      return;
    }
    if (record === undefined) {
      throw new RejectedError("Unknown experimental table.");
    }
    const previousReceipt = record.receipts.find(
      (receipt) =>
        receipt.user === connection.user
        && receipt.requestID === command.requestID,
    );
    if (previousReceipt !== undefined) {
      if (previousReceipt.fingerprint !== JSON.stringify(command)) {
        throw new RejectedError("Request ID reused with a different command.");
      }
      connection.tableID = id;
      send(connection.socket, {
        type: "ok",
        requestID: command.requestID,
        duplicate: true,
        acceptedRevision: previousReceipt.revision,
        ...view(record, connection.user),
      });
      return;
    }
    if (command.type === "reconnect" || command.type === "replay") {
      const snapshot = view(record, connection.user);
      if (command.type === "replay") {
        if (record.state === undefined || record.state.end === 0) {
          throw new RejectedError(
            "Full-deck replay is available only after completion.",
          );
        }
        send(connection.socket, {
          type: "ok",
          requestID: command.requestID,
          ...snapshot,
          replay: {
            format: record.format,
            deck: record.deck,
            actions: record.actions,
            ...replay(record),
          },
        });
      } else {
        connection.tableID = id;
        send(connection.socket, {
          type: "ok",
          requestID: command.requestID,
          ...snapshot,
          events:
            record.state === undefined
              ? []
              : scrubEvents(
                  replay(record).events,
                  record.players.indexOf(connection.user),
                ),
        });
      }
      return;
    }
    if (record.receipts.length >= 256) {
      throw new RejectedError("Experimental command limit reached.");
    }
    const candidate = structuredClone(record);
    let events: readonly SliceEvent[];
    if (command.type === "join") {
      if (
        candidate.players.length !== 1
        || candidate.players.includes(connection.user)
      ) {
        throw new RejectedError("Table is full or you already joined.");
      }
      candidate.players.push(connection.user);
      candidate.state = initialState();
      events = initialEvents(candidate.deck);
    } else if (command.type === "act") {
      const player = candidate.players.indexOf(connection.user);
      if (player === -1 || candidate.state === undefined) {
        throw new RejectedError("You are not a player in a running game.");
      }
      const result = applyMove(
        candidate.deck,
        candidate.state,
        player,
        command.move,
      );
      candidate.state = result.state;
      candidate.actions.push({ player, move: command.move });
      ({ events } = result);
    } else {
      throw new RejectedError(
        "Table creation request conflicts with an existing table.",
      );
    }
    candidate.revision++;
    candidate.receipts.push({
      user: connection.user,
      requestID: command.requestID,
      fingerprint: JSON.stringify(command),
      revision: candidate.revision,
    });
    await persist(candidate, record.revision);
    connection.tableID = id;
    broadcast(candidate, events);
    send(connection.socket, {
      type: "ok",
      requestID: command.requestID,
      ...view(candidate, connection.user),
    });
  }

  async function enqueue(connection: Connection, input: unknown) {
    const envelope = z
      .object({ requestID: z.string().max(64) })
      .safeParse(input);
    let requestID = envelope.success ? envelope.data.requestID : undefined;
    let addressedID: string | undefined;
    const diagnostic = { reported: false };
    function reportFailure(error: unknown) {
      if (addressedID !== undefined) {
        frozen.add(addressedID);
      }
      diagnostic.reported = true;
      console.error(
        "Experimental authority failure",
        {
          tableID: addressedID,
          requestID,
        },
        error,
      );
    }
    try {
      const parsed = commandSchema.safeParse(input);
      if (!parsed.success) {
        throw new RejectedError(
          "Unsupported or malformed experimental command.",
        );
      }
      const command = parsed.data;
      ({ requestID } = command);
      if (draining) {
        throw new RejectedError("Host is draining.");
      }
      const id =
        command.type === "create"
          ? creationID(connection.user, command.requestID)
          : command.tableID;
      addressedID = id;
      let queue = queues.get(id);
      if (queue === undefined) {
        if (queues.size >= 128) {
          throw new RejectedError("Experimental host queue limit reached.");
        }
        queue = { tail: Promise.resolve(), depth: 0 };
        queues.set(id, queue);
      }
      if (queue.depth >= 32) {
        throw new RejectedError("Table queue is full.");
      }
      queue.depth++;
      const result = queue.tail.then(async () => {
        try {
          await handle(connection, command, id);
        } catch (error) {
          // Freeze before releasing this table's queue to the next accepted command.
          if (!(error instanceof RejectedError)) {
            reportFailure(error);
          }
          throw error;
        }
      });
      // This tail is only a sequencing barrier. The original rejection is reported below.
      queue.tail = result.catch(() => undefined);
      try {
        await result;
      } finally {
        queue.depth--;
        if (queue.depth === 0) {
          queues.delete(id);
        }
      }
    } catch (error) {
      if (!(error instanceof RejectedError) && !diagnostic.reported) {
        reportFailure(error);
      }
      let message =
        addressedID === undefined
          ? "Unexpected failure before table dispatch; request was not applied."
          : "Unexpected failure; table frozen. Reconstruct the host before retrying.";
      if (error instanceof RejectedError) {
        ({ message } = error);
      }
      send(connection.socket, {
        type: "error",
        requestID,
        error: message,
      });
    }
  }

  app.get(
    "/experimental",
    {
      websocket: true,
      preValidation: async (request, reply) => {
        const token = request.headers.authorization;
        if (
          draining
          || connections.size >= 64
          || token === undefined
          || !tokens.has(token)
        ) {
          await reply.code(401).send();
        }
      },
    },
    (socket, request) => {
      const token = request.headers.authorization;
      assertDefined(token, "Missing authenticated test token.");
      const user = tokens.get(token);
      assertDefined(user, "Missing authenticated test user.");
      const connection: Connection = { socket, user, tableID: undefined };
      connections.add(connection);
      socket.on("close", () => {
        connections.delete(connection);
      });
      socket.on("error", () => {
        socket.terminate();
      });
      socket.on("message", (data) => {
        let input: unknown;
        try {
          // WebSocket RawData also includes arrays of buffers.
          let text: string;
          if (isArray(data)) {
            text = Buffer.concat(data).toString();
          } else if (data instanceof ArrayBuffer) {
            text = Buffer.from(data).toString();
          } else {
            text = data.toString();
          }
          input = JSON.parse(text);
        } catch {
          send(socket, { type: "error", error: "Malformed JSON." });
          return;
        }
        enqueue(connection, input).catch((error: unknown) => {
          console.error("Experimental WebSocket response failure", error);
          socket.terminate();
        });
      });
    },
  );
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected loopback TCP listener.");
  }
  async function closeHost() {
    draining = true;
    await Promise.all(
      [...queues.values()].map(async (queue) => {
        await queue.tail;
      }),
    );
    for (const connection of connections) {
      connection.socket.terminate();
    }
    await app.close();
    await store.close();
  }
  return {
    url: `ws://127.0.0.1:${address.port}/experimental`,
    session(user: string): string {
      z.string().min(1).max(64).parse(user);
      if (tokens.size >= 256) {
        throw new Error("Experimental session limit reached.");
      }
      const token = `Bearer ${randomBytes(32).toString("base64url")}`;
      tokens.set(token, user);
      return token;
    },
    async close() {
      shutdown ??= closeHost();
      await shutdown;
    },
  };
}
