import { describe, expect, test } from "bun:test";
import { expectedSchemaVersion } from "./schemaVersion";

describe("migration versions", () => {
  test("accepts an empty baseline and orders migrations numerically", () => {
    expect(expectedSchemaVersion([".gitkeep"])).toBe(0);
    expect(
      expectedSchemaVersion(["002_second.sql", ".gitkeep", "001_first.sql"]),
    ).toBe(2);
  });

  test.each([
    [["unversioned.sql"]],
    [["000_zero.sql"]],
    [["001_first.sql", "003_gap.sql"]],
    [["001_first.sql", "0001_duplicate.sql"]],
  ])("rejects an invalid migration set: %j", (names: readonly string[]) => {
    expect(() => expectedSchemaVersion(names)).toThrow();
  });
});
