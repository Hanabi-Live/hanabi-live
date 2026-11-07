import { describe, expect, test } from "bun:test";
import { expectedSchemaVersion } from "./schemaVersion";

describe("migration versions", () => {
  test("accepts an empty baseline and orders migrations numerically", () => {
    expect(expectedSchemaVersion(["baseline.txt"])).toBe(6);
    expect(
      expectedSchemaVersion([
        "008_second.sql",
        "baseline.txt",
        "007_first.sql",
      ]),
    ).toBe(8);
  });

  test.each([
    [["unversioned.sql"]],
    [["000_zero.sql"]],
    [["006_retired.sql"]],
    [["007_first.sql", "009_gap.sql"]],
    [["007_first.sql", "0007_duplicate.sql"]],
  ])("rejects an invalid migration set: %j", (names: readonly string[]) => {
    expect(() => expectedSchemaVersion(names)).toThrow();
  });
});
