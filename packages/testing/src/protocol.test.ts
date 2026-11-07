import {
  CLIENT_COMMAND_SCHEMAS,
  SERVER_COMMAND_SCHEMAS,
  SERVER_WIRE_SCHEMAS,
} from "@hanabi-live/data";
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const fixture = z.strictObject({
  name: z.string(),
  direction: z.enum(["client", "server"]),
  command: z.string(),
  input: z.unknown(),
  valid: z.boolean(),
  nativeValid: z.boolean().optional(),
  normalized: z.unknown().optional(),
});
const contents = readFileSync(
  path.resolve(
    __dirname,
    "../../../server/protocol/fixtures/compatibility.json",
  ),
  "utf8",
);
const cases = fixture.array().parse(JSON.parse(contents));

test.each(cases)("$direction: $name", (entry) => {
  const schemas: Readonly<Record<string, z.ZodType>> =
    entry.direction === "client"
      ? CLIENT_COMMAND_SCHEMAS
      : SERVER_COMMAND_SCHEMAS;
  const schema = schemas[entry.command];
  if (schema === undefined) {
    throw new Error(`Missing schema: ${entry.command}`);
  }
  const result = schema.safeParse(entry.input);
  expect(result.success).toBe(entry.valid);
  if (result.success) {
    expect(result.data).toEqual(entry.normalized ?? entry.input);
  }
});

test("legacy absent relationship payloads retain their defaults", () => {
  expect(CLIENT_COMMAND_SCHEMAS.chatFriend.parse(undefined)).toEqual({
    name: "",
    room: "",
  });

  expect(CLIENT_COMMAND_SCHEMAS.chatLinked.parse(undefined)).toEqual({
    room: "",
  });
});

test("hidden clue frames require both identity fields to be concealed", () => {
  const action = { type: "clue", giver: 0, target: 1, list: [5], turn: 0 };
  const schema = SERVER_COMMAND_SCHEMAS.gameAction;
  expect(
    schema.safeParse({
      tableID: 1,
      action: { ...action, clue: { type: -1, value: -1 } },
    }).success,
  ).toBe(true);
  expect(
    schema.safeParse({
      tableID: 1,
      action: { ...action, clue: { type: -1, value: 3 } },
    }).success,
  ).toBe(false);
});

// Server messages whose client schema is still written by hand instead of generated from the Rust
// types in server/protocol. Remove a message from this list when it moves to a generated schema.
const HAND_WRITTEN_SERVER_MESSAGES = [
  "boot",
  "cardIdentities",
  "clock",
  "connected",
  "error",
  "finishOngoingGame",
  "friends",
  "game",
  "gameAction",
  "gameActionList",
  "gameHistory",
  "gameHistoryOtherScores",
  "hypoAction",
  "hypoBack",
  "hypoEnd",
  "hypoShowDrawnCards",
  "hypoStart",
  "hypothetical",
  "init",
  "note",
  "noteList",
  "noteListPlayer",
  "pause",
  "replayEfficiencyMod",
  "replayIndicator",
  "replayLeader",
  "replaySegment",
  "replaySound",
  "soundLobby",
  "spectators",
  "suggestion",
  "table",
  "tableList",
  "user",
  "userInactive",
  "userLeft",
  "userList",
  "voteChange",
  "warning",
  "welcome",
] as const;

test("only the listed server messages use hand-written schemas", () => {
  const generated: Readonly<Record<string, unknown>> = SERVER_WIRE_SCHEMAS;
  const handWritten = Object.entries(SERVER_COMMAND_SCHEMAS)
    .filter(([command, schema]) => generated[command] !== schema)
    .map(([command]) => command)
    .toSorted();
  expect(handWritten).toEqual([...HAND_WRITTEN_SERVER_MESSAGES]);
});
