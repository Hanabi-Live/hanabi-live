import {
  CLIENT_COMMAND_SCHEMAS,
  SERVER_COMMAND_SCHEMAS,
} from "@hanabi-live/data";
import { expect, test } from "@jest/globals";
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
    "../../../experimental/rust-server/protocol/fixtures/compatibility.json",
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

test("request IDs remain UTF-8 bounded, not character-count bounded", () => {
  const schema = CLIENT_COMMAND_SCHEMAS.chat;
  expect(
    schema.safeParse({
      msg: "x",
      room: "lobby",
      requestID: "\u{E9}".repeat(64),
    }).success,
  ).toBe(true);
  expect(
    schema.safeParse({
      msg: "x",
      room: "lobby",
      requestID: "\u{E9}".repeat(65),
    }).success,
  ).toBe(false);
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
