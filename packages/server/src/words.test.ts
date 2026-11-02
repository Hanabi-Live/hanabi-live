import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { getRandomTableName } from "./words";

jest.mock("./constants", () => ({ REPO_ROOT: "/synthetic" }));
jest.mock("node:fs", () => ({
  readFileSync: () => "alpha\nbeta\ngamma\ndelta\n",
}));

afterEach(() => {
  jest.restoreAllMocks();
});

describe("table-name sampling without replacement", () => {
  test.each([
    [0, "alpha beta gamma"],
    [0.999, "delta gamma beta"],
    [0.5, "gamma beta delta"],
  ] as const)(
    "repeated random draws at %s select distinct words without consuming the dictionary",
    (draw, expected) => {
      jest.spyOn(Math, "random").mockReturnValue(draw);
      expect(getRandomTableName()).toBe(expected);
      expect(getRandomTableName()).toBe(expected);
    },
  );

  test("every ordered triple remains reachable with equal-sized sampling buckets", () => {
    const random = jest.spyOn(Math, "random");
    const names = new Set<string>();
    for (let first = 0; first < 4; first++) {
      for (let second = 0; second < 3; second++) {
        for (let third = 0; third < 2; third++) {
          random
            .mockReturnValueOnce((first + 0.5) / 4)
            .mockReturnValueOnce((second + 0.5) / 3)
            .mockReturnValueOnce((third + 0.5) / 2);
          const name = getRandomTableName();
          expect(new Set(name.split(" ")).size).toBe(3);
          names.add(name);
        }
      }
    }
    expect(names.size).toBe(24);
  });
});
