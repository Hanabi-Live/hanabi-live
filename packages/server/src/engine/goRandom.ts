// Derived from Go's legacy math/rand source; see goRandom.LICENSE.
/* eslint-disable no-bitwise */
import { assertDefined } from "complete-common";
import cookedData from "./goRandom.json";

const COOKED: readonly bigint[] = cookedData.map(BigInt);
const INT32_MAX = 2_147_483_647n;
const MASK_63 = (1n << 63n) - 1n;
const CRC_TABLE: readonly bigint[] = Array.from({ length: 256 }, (_, index) => {
  let value = BigInt(index);
  for (let bit = 0; bit < 8; bit++) {
    value =
      (value & 1n) === 1n
        ? (value >> 1n) ^ 0xc9_6c_57_95_d7_87_0f_42n
        : value >> 1n;
  }
  return value;
});

export function seedToInt64(seed: string): bigint {
  let bytes = Buffer.from(seed);
  if (seed.startsWith("legacy-")) {
    if (bytes.length < 9) {
      throw new RangeError("Malformed legacy seed prefix.");
    }
    // Historical Go strips exactly nine bytes, not a variable-length prefix.
    bytes = bytes.subarray(9);
  }
  let checksum = BigInt.asUintN(64, -1n);
  for (const byte of bytes) {
    const index = Number((checksum & 0xffn) ^ BigInt(byte));
    const entry = CRC_TABLE[index];
    assertDefined(entry, "Missing CRC table entry.");
    checksum = entry ^ (checksum >> 8n);
  }
  return BigInt.asIntN(64, ~checksum);
}

function seedStep(value: number): number {
  const high = Math.floor(value / 44_488);
  const low = value % 44_488;
  const next = 48_271 * low - 3399 * high;
  return next < 0 ? next + Number(INT32_MAX) : next;
}

export class GoRandom {
  private tap = 0;
  private feed = 607 - 273;
  private readonly state: bigint[] = [];

  constructor(seed: bigint) {
    if (BigInt.asIntN(64, seed) !== seed) {
      throw new RangeError("Random seed must fit a signed 64-bit integer.");
    }
    let normalized = seed % INT32_MAX;
    if (normalized < 0n) {
      normalized += INT32_MAX;
    }
    if (normalized === 0n) {
      normalized = 89_482_311n;
    }
    let value = Number(normalized);
    for (let index = -20; index < 607; index++) {
      value = seedStep(value);
      if (index >= 0) {
        let word = BigInt(value) << 40n;
        value = seedStep(value);
        word ^= BigInt(value) << 20n;
        value = seedStep(value);
        word ^= BigInt(value);
        const cooked = COOKED[index];
        assertDefined(cooked, "Missing Go random initialization word.");
        this.state.push(BigInt.asUintN(64, word ^ cooked));
      }
    }
  }

  int63(): bigint {
    this.tap = (this.tap + 606) % 607;
    this.feed = (this.feed + 606) % 607;
    const feed = this.state[this.feed];
    const tap = this.state[this.tap];
    assertDefined(feed, "Missing random feedback word.");
    assertDefined(tap, "Missing random tap word.");
    const value = BigInt.asUintN(64, feed + tap);
    this.state[this.feed] = value;
    return value & MASK_63;
  }

  intn(bound: number): number {
    if (!Number.isSafeInteger(bound) || bound <= 0) {
      throw new RangeError("Random bound must be a positive safe integer.");
    }
    const n = BigInt(bound);
    const useInt31 = n <= INT32_MAX;
    const range = 1n << (useInt31 ? 31n : 63n);
    const next = () => (useInt31 ? this.int63() >> 32n : this.int63());
    if ((n & (n - 1n)) === 0n) {
      return Number(next() & (n - 1n));
    }
    const maximum = range - 1n - (range % n);
    let value = next();
    while (value > maximum) {
      value = next();
    }
    return Number(value % n);
  }
}
