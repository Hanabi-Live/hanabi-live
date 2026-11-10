import {
  CLIENT_COMMAND_SCHEMAS,
  SERVER_COMMAND_SCHEMAS,
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

test("hidden clue frames require both identity fields to be concealed", () => {
  const action = { type: "clue", giver: 0, target: 1, orders: [5], turn: 0 };
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
