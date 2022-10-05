import { getVariantFromArgs, getVariantFromPartial } from "./chatCommands";

jest.mock("./chat", () => ({}));
jest.mock("./globals", () => ({}));
jest.mock("./lobby/createGame", () => ({}));
jest.mock("./modals", () => ({}));
jest.mock("./lobby/createReplayJSON.ts", () => ({}));

const brownFives = "Brown-Fives (6 Suits)";
const brownFivesPrism6Suits = "Brown-Fives & Prism (6 Suits)";

describe("functions", () => {
  describe("parsing variant from input", () => {
    describe("normal input", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "Brown-Fives & Prism (6 Suits)".split(" "),
        );
        expect(getVariantFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
    });
    describe("partial input", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs("Brown-Fives & Pri".split(" "));
        expect(getVariantFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
      test("is valid", () => {
        const partial = getVariantFromArgs("Brown-Fives".split(" "));
        expect(getVariantFromPartial(partial)).toBe(brownFives);
      });
    });
    describe("double spaces", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "   Brown-Fives   &  Prism   (6   Suits)    ".split(" "),
        );
        expect(getVariantFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
    });
    describe("spaces before or after -, &, (, )", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "   Brown -Fives& Prism(  6 Suits   )  ".split(" "),
        );
        expect(getVariantFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
    });
    describe("capitalize", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "bROWN-FivES & prism (6 SUITS)".split(" "),
        );
        expect(getVariantFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
    });
    describe("all possible cases", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "  bROWN -FivES   &prism(6 suits )".split(" "),
        );
        expect(getVariantFromPartial(partial)).toBe(brownFivesPrism6Suits);
      });
    });
  });
});
