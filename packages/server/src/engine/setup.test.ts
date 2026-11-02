import { getVariant, VARIANT_NAMES } from "@hanabi-live/game";
import { describe, expect, test } from "@jest/globals";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { assignCharacters, createShuffledDeck } from "./setup";

function fixture(name: string): unknown {
  const filename = path.resolve(
    __dirname,
    "../../../../server/src/testdata",
    name,
  );
  return JSON.parse(readFileSync(filename, "utf8"));
}

const deckCase = z.object({
  variant: z.string(),
  seed: z.string(),
  size: z.number(),
  digest: z.string(),
});
const decks = z.array(deckCase).parse(fixture("deck_setup.json"));
const assignment = z.object({ name: z.string(), metadata: z.number() });
const characterCase = z.object({
  variant: z.string(),
  seed: z.string(),
  players: z.string().array(),
  assignments: z.array(assignment),
});
const characters = z
  .array(characterCase)
  .parse(fixture("character_setup.json"));

describe("Go-compatible game setup", () => {
  test("covers every supported variant rather than only standard games", () => {
    expect(decks.map(({ variant }) => variant).toSorted()).toEqual(
      [...VARIANT_NAMES].toSorted(),
    );
  });

  test.each(decks)("preserves the historical deck for $variant", (sample) => {
    const deck = createShuffledDeck(getVariant(sample.variant), sample.seed);
    expect(deck).toHaveLength(sample.size);
    const digest = createHash("sha256")
      .update(JSON.stringify(deck))
      .digest("hex");
    expect(digest).toBe(sample.digest);
  });

  test.each(characters)(
    "preserves character assignment for $variant/$seed",
    (sample) => {
      const variant = getVariant(sample.variant);
      expect(assignCharacters(variant, sample.seed, sample.players)).toEqual(
        sample.assignments,
      );
      createShuffledDeck(variant, sample.seed);
      if (!sample.seed.startsWith("legacy-")) {
        expect(
          assignCharacters(variant, `legacy-1-${sample.seed}`, sample.players),
        ).toEqual(sample.assignments);
      }
    },
  );

  test("legacy seed prefixes preserve deals", () => {
    const variant = getVariant("No Variant");
    const deck = createShuffledDeck(variant, "p2v0s1");
    expect(createShuffledDeck(variant, "legacy-1-p2v0s1")).toEqual(deck);
    expect(createShuffledDeck(variant, "legacy-2-p2v0s1")).toEqual(deck);
  });
});
