import { describe, expect, test } from "bun:test";
import { expectedSchemaVersion } from "./schemaVersion";

describe("migration versions", () => {
  test("accepts an empty baseline and orders migrations numerically", () => {
    expect(expectedSchemaVersion(["baseline.txt"])).toBe(7);
    expect(
      expectedSchemaVersion([
        "009_second.sql",
        "baseline.txt",
        "008_first.sql",
      ]),
    ).toBe(9);
  });

  test.each([
    [["unversioned.sql"]],
    [["000_zero.sql"]],
    [["007_retired.sql"]],
    [["008_first.sql", "010_gap.sql"]],
    [["008_first.sql", "0008_duplicate.sql"]],
  ])("rejects an invalid migration set: %j", (names: readonly string[]) => {
    expect(() => expectedSchemaVersion(names)).toThrow();
  });
});
