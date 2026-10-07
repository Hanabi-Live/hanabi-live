import { describe, expect, jest, test } from "@jest/globals";
import {
  getVariantFromArgs,
  getVariantNameFromPartial,
  parsePMHistoryCommandArgs,
} from "./chatCommands";

jest.mock("./chat", () => ({}));
jest.mock("./Globals", () => ({}));
jest.mock("./lobby/createGame", () => ({}));
jest.mock("./modals", () => ({}));
jest.mock("./lobby/createReplayJSON.ts", () => ({}));

const brownFives = "Brown-Fives (6 Suits)";
const brownFivesPrism6Suits = "Brown-Fives & Prism (6 Suits)";

describe("functions", () => {
  describe("parsing PM history arguments", () => {
    test("uses five messages by default", () => {
      expect(parsePMHistoryCommandArgs([])).toEqual({ amount: 5 });
      expect(parsePMHistoryCommandArgs(["Alice"])).toEqual({
        username: "Alice",
        amount: 5,
      });
    });

    test("accepts an amount with or without a username", () => {
      expect(parsePMHistoryCommandArgs(["15"])).toEqual({ amount: 15 });
      expect(parsePMHistoryCommandArgs(["Alice", "15"])).toEqual({
        username: "Alice",
        amount: 15,
      });
    });

    test.each([
      [["0"]],
      [["101"]],
      [["Alice", "0"]],
      [["Alice", "101"]],
      [["Alice", "nope"]],
      [["Alice", "5", "extra"]],
    ])("rejects invalid arguments: %j", (args: readonly string[]) => {
      expect(parsePMHistoryCommandArgs(args)).toBeUndefined();
    });
  });

  describe("parsing variant from input", () => {
    describe("normal input", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "Brown-Fives & Prism (6 Suits)".split(" "),
        );
        expect(getVariantNameFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
    });
    describe("partial input", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs("Brown-Fives & Pri".split(" "));
        expect(getVariantNameFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
      test("is valid", () => {
        const partial = getVariantFromArgs("Brown-Fives".split(" "));
        expect(getVariantNameFromPartial(partial)).toBe(brownFives);
      });
    });
    describe("double spaces", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "   Brown-Fives   &  Prism   (6   Suits)    ".split(" "),
        );
        expect(getVariantNameFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
    });
    describe("spaces before or after -, &, (, )", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "   Brown -Fives& Prism(  6 Suits   )  ".split(" "),
        );
        expect(getVariantNameFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
    });
    describe("capitalize", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "bROWN-FivES & prism (6 SUITS)".split(" "),
        );
        expect(getVariantNameFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
    });
    describe("all possible cases", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "  bROWN -FivES   &prism(6 suits )".split(" "),
        );
        expect(getVariantNameFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
    });
  });
});
