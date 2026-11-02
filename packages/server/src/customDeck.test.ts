import { getVariant } from "@hanabi-live/game";
import { expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { customDeckBytes, decodeCustomDeck } from "./customDeck";
import { createShuffledDeck } from "./engine/setup";

const filename = path.resolve(
  __dirname,
  "../../../server/src/testdata/custom_deck.json",
);
const raw: unknown = JSON.parse(readFileSync(filename, "utf8"));
const fixture = z
  .strictObject({
    variantName: z.string(),
    seed: z.string(),
    hex: z.string(),
  })
  .parse(raw);
const variant = getVariant(fixture.variantName);
// The supported TypeScript library does not include Uint8Array.fromHex.
// eslint-disable-next-line unicorn/prefer-uint8array-hex
const bytes = Buffer.from(fixture.hex, "hex");

test("Go and TypeScript share the compact deck representation without storing seed-reconstructible decks", () => {
  const deck = decodeCustomDeck(bytes, variant);
  expect(deck).toHaveLength(50);
  expect(deck.slice(0, 6)).toEqual([
    { suitIndex: 0, rank: 1 },
    { suitIndex: 1, rank: 2 },
    { suitIndex: 2, rank: 3 },
    { suitIndex: 3, rank: 4 },
    { suitIndex: 4, rank: 5 },
    { suitIndex: 0, rank: 7 },
  ]);
  expect(customDeckBytes(deck, variant, fixture.seed)).toEqual(bytes);
  expect(
    customDeckBytes(
      createShuffledDeck(variant, fixture.seed),
      variant,
      fixture.seed,
    ),
  ).toBeUndefined();
});

test("trusted short decks retain their declared count without accepting truncated full decks", () => {
  const short = decodeCustomDeck(bytes, variant).slice(0, 11);
  const encoded = customDeckBytes(short, variant, fixture.seed);
  expect(encoded).toHaveLength(12);
  expect(encoded?.[0]).toBe(0x80 + 11);
  expect(decodeCustomDeck(encoded, variant)).toEqual(short);
  expect(() => decodeCustomDeck(bytes.subarray(0, 12), variant)).toThrow();
  expect(() => decodeCustomDeck(bytes.subarray(0, -1), variant)).toThrow();
});

test.each([0, 6, 41, 255])(
  "correctly framed decks still reject invalid card code %s",
  (code) => {
    const invalid = Buffer.from(bytes);
    invalid[1] = code;
    expect(() => decodeCustomDeck(invalid, variant)).toThrow();
  },
);

test.each([
  Buffer.alloc(0),
  Buffer.alloc(49, 1),
  Buffer.alloc(61, 1),
  Buffer.alloc(50, 0),
  Buffer.alloc(50, 6),
  Buffer.alloc(50, 41),
  Buffer.alloc(50, 255),
  "010a",
  [1, 2, 3],
])("malformed sparse deck data fails closed (%#)", (data) => {
  expect(() => decodeCustomDeck(data, variant)).toThrow();
});
