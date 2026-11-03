// The parser deliberately follows the nested Go corpus.
/* eslint-disable unicorn/max-nested-calls */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { eventSchema } from "./engine";

const pointSchema = z.object({
  state: z.object({
    ActivePlayerIndex: z.number(),
    ClueTokens: z.number(),
    DeckIndex: z.number(),
    EndCondition: z.number(),
    EndTurn: z.number(),
    MaxScore: z.number(),
    Score: z.number(),
    Strikes: z.number(),
    Turn: z.number(),
    Stacks: z.array(z.number()),
    Players: z.array(z.object({ Hand: z.array(z.number()) })),
    Cards: z.array(
      z.object({
        Order: z.number(),
        Touched: z.boolean().default(false),
        Played: z.boolean().default(false),
        Discarded: z.boolean().default(false),
        Failed: z.boolean().default(false),
      }),
    ),
  }),
  events: z.array(z.unknown()),
  recipients: z.array(
    z.array(
      z.object({
        command: z.string(),
        data: z.looseObject({
          action: z.unknown().optional(),
          list: z.array(z.unknown()).optional(),
        }),
      }),
    ),
  ),
});
const fixtureSchema = z.object({
  version: z.literal(1),
  input: z.object({
    name: z.string(),
    options: z.record(
      z.string(),
      z.union([z.number(), z.string(), z.boolean()]),
    ),
    commands: z.array(
      z.object({
        player: z.number(),
        type: z.number(),
        target: z.number(),
        value: z.number(),
        request: z.string().optional(),
        want: z.enum([
          "accepted",
          "rejected",
          "duplicate",
          "restored",
          "reconnect",
        ]),
      }),
    ),
  }),
  deck: z.array(z.object({ suitIndex: z.number(), rank: z.number() })),
  initial: pointSchema,
  steps: z.array(pointSchema),
});

export function compatibilityCorpus(): ReadonlyArray<{
  fixture: z.infer<typeof fixtureSchema>;
  reasons: readonly string[];
}> {
  const directory = path.resolve(
    __dirname,
    "../../../../server/src/testdata/compatibility",
  );
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const fixture = fixtureSchema.parse(
        JSON.parse(readFileSync(path.join(directory, name), "utf8")),
      );
      const reasons: string[] = [];
      for (const [key, value] of Object.entries(fixture.input.options)) {
        let expected: string | number | boolean = false;
        if (key === "numPlayers") {
          expected = 2;
        } else if (key === "variantName") {
          expected = "No Variant";
        } else if (
          ["startingPlayer", "timeBase", "timePerTurn", "variantID"].includes(
            key,
          )
        ) {
          expected = 0;
        }
        if (value !== expected) {
          reasons.push(`${key}=${value}`);
        }
      }
      if (fixture.deck.length !== 50) {
        reasons.push("nonstandard deck length");
      }
      return { fixture, reasons };
    });
}

export function recipientEvents(
  point: z.infer<typeof pointSchema>,
  player: number,
): ReadonlyArray<z.infer<typeof eventSchema>> {
  const messages = point.recipients[player] ?? [];
  return messages.flatMap((message) => {
    if (message.command === "gameAction") {
      return [eventSchema.parse(message.data.action)];
    }
    if (message.command === "gameActionList") {
      return z.array(eventSchema).parse(message.data.list);
    }
    return [];
  });
}
