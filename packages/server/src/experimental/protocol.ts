// Zod schemas deliberately mirror the nested persisted format.
/* eslint-disable unicorn/max-nested-calls */
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Card, SliceEvent, State } from "./engine";
import {
  applyMove,
  cardSchema,
  format,
  initialEvents,
  initialState,
  moveSchema,
  RejectedError,
  stateSchema,
  validateDeck,
} from "./engine";

const requestID = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[\w-]+$/u);
const tableID = z.string().regex(/^[\da-f]{32}$/u);
const base = { requestID };
const addressed = { ...base, tableID };
export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...base,
    type: z.literal("create"),
    options: z.strictObject({
      numPlayers: z.literal(2),
      variantName: z.literal("No Variant"),
    }),
  }),
  z.strictObject({ ...addressed, type: z.literal("join") }),
  z.strictObject({ ...addressed, type: z.literal("reconnect") }),
  z.strictObject({ ...addressed, type: z.literal("replay") }),
  z.strictObject({ ...addressed, type: z.literal("act"), move: moveSchema }),
]);
export type Command = z.infer<typeof commandSchema>;

const actionSchema = z.strictObject({
  player: z.number().int().min(0).max(1),
  move: moveSchema,
});
const recordSchema = z.strictObject({
  format: z.literal(format),
  id: tableID,
  revision: z.number().int().positive(),
  players: z.array(z.string().min(1).max(64)).min(1).max(2),
  deck: z.array(cardSchema).length(50),
  state: stateSchema.optional(),
  actions: z.array(actionSchema).max(256),
  receipts: z
    .array(
      z.strictObject({
        user: z.string(),
        requestID,
        fingerprint: z.string(),
        revision: z.number().int().positive(),
      }),
    )
    .max(256),
});
export type SliceRecord = z.infer<typeof recordSchema>;

export function creationID(user: string, id: string): string {
  return createHash("sha256")
    .update(JSON.stringify([user, id]))
    .digest("hex")
    .slice(0, 32);
}

export function replay(record: SliceRecord): {
  state: State;
  events: SliceEvent[];
} {
  if (record.players.length !== 2) {
    throw new RejectedError("The game has not started.");
  }
  let state = initialState();
  const events: SliceEvent[] = initialEvents(record.deck);
  for (const action of record.actions) {
    const result = applyMove(record.deck, state, action.player, action.move);
    ({ state } = result);
    events.push(...result.events);
  }
  return { state, events };
}

export function validateRecord(input: unknown): SliceRecord {
  const record = recordSchema.parse(input);
  validateDeck(record.deck);
  if (
    record.revision !== record.receipts.length
    || new Set(record.players).size !== record.players.length
    || record.receipts.some(
      (receipt, index) =>
        receipt.revision !== index + 1
        || !record.players.includes(receipt.user),
    )
    || new Set(
      record.receipts.map((receipt) =>
        JSON.stringify([receipt.user, receipt.requestID]),
      ),
    ).size !== record.receipts.length
  ) {
    throw new Error("Invalid experimental checkpoint receipts.");
  }
  if (record.players.length === 1) {
    if (record.state !== undefined || record.actions.length > 0) {
      throw new Error("Invalid waiting checkpoint.");
    }
  } else if (
    !isDeepStrictEqual(stateSchema.parse(replay(record).state), record.state)
  ) {
    throw new Error(
      "Checkpoint does not match versioned authoritative replay.",
    );
  }
  return record;
}

export function newRecord(
  user: string,
  command: Command & { type: "create" },
  deck: readonly Card[],
): SliceRecord {
  return {
    format,
    id: creationID(user, command.requestID),
    revision: 1,
    players: [user],
    deck: validateDeck(deck),
    actions: [],
    receipts: [
      {
        user,
        requestID: command.requestID,
        fingerprint: JSON.stringify(command),
        revision: 1,
      },
    ],
  };
}
