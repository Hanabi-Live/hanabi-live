import {
  DEFAULT_PLAYER_NAMES,
  options,
  rank,
  suitIndex,
} from "@hanabi-live/game";
import { expect, test } from "@jest/globals";
import { assertDefined, isArray } from "complete-common";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { importReplay } from "./replayImport";

const card = z.object({ suitIndex, rank });
const character = z.object({ name: z.string(), metadata: z.number() });
const action = z.object({
  type: z.number(),
  target: z.number(),
  value: z.number(),
});
const result = z.object({ events: z.string() });
const step = z.object({ action, accepted: z.boolean(), result });
const trace = z.object({
  name: z.string(),
  options: options.unwrap().strip(),
  seed: z.string(),
  characters: character.array().nullable(),
  initial: result,
  steps: step.array(),
  deck: card.array().optional(),
  live: z.boolean().default(false),
});
const raw: unknown = JSON.parse(
  readFileSync(
    path.resolve(
      __dirname,
      "../../../server/src/testdata/engine_authority.json",
    ),
    "utf8",
  ),
);
const traces = trace
  .array()
  .parse(raw)
  .filter((entry) => !entry.live);

function digest(value: unknown): string {
  const json = JSON.stringify(value, (_key, nested: unknown): unknown => {
    if (nested !== null && typeof nested === "object" && !isArray(nested)) {
      const object = z.record(z.string(), z.unknown()).parse(nested);
      return Object.fromEntries(
        Object.entries(object).toSorted(([first], [second]) =>
          first < second ? -1 : Number(first > second),
        ),
      );
    }
    return nested;
  });
  return createHash("sha256").update(json).digest("hex");
}

test.each(traces)("imports Go-authoritative replay: $name", (entry): void => {
  const { variantName, detrimentalCharacters, ...modifiers } = entry.options;
  const input = {
    players: DEFAULT_PLAYER_NAMES.slice(0, entry.options.numPlayers),
    seed: entry.deck === undefined ? entry.seed : "",
    deck: entry.deck,
    characters: entry.characters ?? [],
    options: {
      ...modifiers,
      variant: variantName,
      ...(detrimentalCharacters && { detrimentalCharacters }),
    },
  };
  if (entry.deck !== undefined) {
    // These engine-only Go fixtures deliberately use eleven-card decks, which JSON imports reject.
    expect(() => importReplay(input)).toThrow("50 valid cards");
    return;
  }
  const initial = importReplay(input);
  expect(digest(initial.state.events)).toBe(entry.initial.events);
  const accepted = entry.steps.filter((operation) => operation.accepted);
  const last = accepted.at(-1);
  assertDefined(last, "An oracle replay must include an accepted action.");
  const before = importReplay({
    ...input,
    actions: accepted.slice(0, -1).map((operation) => operation.action),
  });
  const after = importReplay({
    ...input,
    actions: accepted.map((operation) => operation.action),
  });
  expect(before.warnings).toEqual([]);
  expect(after.warnings).toEqual([]);
  expect(digest(after.state.events.slice(before.state.events.length))).toBe(
    last.result.events,
  );
});
