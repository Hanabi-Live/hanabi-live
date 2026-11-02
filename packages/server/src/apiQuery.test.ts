import { describe, expect, test } from "@jest/globals";
import { parseGameQuery } from "./apiQuery";

describe("public game API query compatibility", () => {
  test("preserves pagination defaults, zero-size pages and selected sort direction", () => {
    expect(
      parseGameQuery({ page: "-1", size: "101" }, "history"),
    ).toMatchObject({
      offset: 0,
      size: 10,
      order: "id",
      ascending: false,
    });
    expect(parseGameQuery({ page: "3", size: "0" }, "seed")).toMatchObject({
      offset: 0,
      size: 0,
      order: "score",
    });
    expect(
      parseGameQuery({ page: "2", size: "5", "col[1]": "0" }, "seed"),
    ).toMatchObject({
      offset: 10,
      size: 5,
      order: "numPlayers",
      ascending: true,
    });
  });

  test("only accepts whitelisted numeric filters and ignores blank controls", () => {
    expect(
      parseGameQuery(
        {
          "fcol[0]": "",
          "fcol[2]": "25",
          "fcol[3]": "0",
          "fcol[99]": "unsafe",
        },
        "history",
      ).filters,
    ).toEqual([
      { field: "score", value: 25 },
      { field: "variantID", value: 0 },
    ]);
    expect(parseGameQuery({ "fcol[1]": "unsafe" }, "seed").filters).toEqual([]);
    expect(() => parseGameQuery({ "fcol[0]": "1 OR 1=1" }, "history")).toThrow(
      RangeError,
    );
    expect(() =>
      parseGameQuery(
        { page: String(Number.MAX_SAFE_INTEGER), size: "100" },
        "history",
      ),
    ).toThrow(RangeError);
  });
});
