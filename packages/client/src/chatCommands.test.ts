import { describe, expect, test, vi } from "vitest";

vi.mock("./chat.ts", () => ({
  SelfChatMessageType: {},
  sendSelfPmFromServer: vi.fn(),
  sendChat: vi.fn(),
}));
vi.mock("./Globals.ts", () => ({ globals: {} }));
vi.mock("./lobby/createGame.ts", () => ({}));
vi.mock("./modals.ts", () => ({}));
vi.mock("./lobby/createReplayJson.ts", () => ({
  createJsonFromReplay: vi.fn(),
}));
const {
  getVariantFromArgs,
  getVariantNameFromPartial,
  parsePmHistoryCommandArgs,
} = await import("./chatCommands.ts");

const brownFives = "Brown-Fives (6 Suits)";
const brownFivesPrism6Suits = "Brown-Fives & Prism (6 Suits)";

describe("functions", () => {
  describe("parsing PM history arguments", () => {
    test("uses five messages by default", () => {
      expect(parsePmHistoryCommandArgs([])).toEqual({ limit: 5 });
      expect(parsePmHistoryCommandArgs(["Alice"])).toEqual({
        recipient: "Alice",
        limit: 5,
      });
    });

    test("accepts an amount with or without a username", () => {
      expect(parsePmHistoryCommandArgs(["15"])).toEqual({ limit: 15 });
      expect(parsePmHistoryCommandArgs(["Alice", "15"])).toEqual({
        recipient: "Alice",
        limit: 15,
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
      expect(parsePmHistoryCommandArgs(args)).toBeUndefined();
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
