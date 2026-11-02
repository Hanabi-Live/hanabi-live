import { describe, expect, test } from "@jest/globals";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { GoRandom, seedToInt64 } from "./goRandom";

const seedSchema = z.object({ input: z.string(), value: z.string() });
const boundSchema = z.object({ bound: z.number(), value: z.number() });
const streamSchema = z.object({
  seed: z.string(),
  int63: z.string().array(),
  intn: z.array(boundSchema),
  digest: z.string(),
});
const corpusSchema = z.object({
  seeds: z.array(seedSchema),
  streams: z.array(streamSchema),
});
const filename = path.resolve(
  __dirname,
  "../../../../server/src/testdata/random_protocol.json",
);
const corpus = corpusSchema.parse(JSON.parse(readFileSync(filename, "utf8")));

describe("legacy Go deterministic random streams", () => {
  test.each(corpus.seeds)(
    "preserves seed conversion for %j",
    ({ input, value }) => {
      expect(seedToInt64(input).toString()).toBe(value);
    },
  );

  test.each(corpus.streams)(
    "matches Go integer draws and the full state cycle for $seed",
    (sample) => {
      const rng = new GoRandom(BigInt(sample.seed));
      expect(sample.int63.map(() => rng.int63().toString())).toEqual(
        sample.int63,
      );
      const bounded = new GoRandom(BigInt(sample.seed));
      expect(sample.intn.map(({ bound }) => bounded.intn(bound))).toEqual(
        sample.intn.map(({ value }) => value),
      );
      const stream = new GoRandom(BigInt(sample.seed));
      const digest = createHash("sha256");
      const buffer = Buffer.alloc(8);
      for (let index = 0; index < 4096; index++) {
        buffer.writeBigUInt64LE(stream.int63());
        digest.update(buffer);
      }
      expect(digest.digest("hex")).toBe(sample.digest);
    },
  );

  test("interleaved games do not share random state", () => {
    const first = new GoRandom(seedToInt64("p2v0s1"));
    const expected = new GoRandom(seedToInt64("p2v0s1"));
    const other = new GoRandom(seedToInt64("p4v0s1"));
    for (let i = 1; i < 80; i++) {
      other.intn(i);
      expect(first.intn(i)).toBe(expected.intn(i));
    }
  });

  test("rejects invalid bounds and malformed legacy seed prefixes", () => {
    const rng = new GoRandom(0n);
    for (const bound of [0, -1, 1.5, Infinity]) {
      expect(() => rng.intn(bound)).toThrow(RangeError);
    }
    expect(() => seedToInt64("legacy-")).toThrow(RangeError);
    expect(() => new GoRandom(9_223_372_036_854_775_808n)).toThrow(RangeError);
  });
});
