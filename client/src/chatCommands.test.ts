import { getVariantFromArgs, getVariantFromPartial } from "./chatCommands";

jest.mock("./chat", () => {
  return {};
});
jest.mock("./globals", () => {
  return {};
});
jest.mock("./lobby/createGame", () => {
  return {};
});
jest.mock("./modals", () => {
  return {};
});

const target = "Brown-Fives & Prism (6 Suits)";

describe("functions", () => {
  describe("parsing variant from input", () => {
    describe("normal input", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs(
          "Brown-Fives & Prism (6 Suits)".split(" "),
        );
        expect(getVariantFromPartial(partial)).toBe(target);
      });
    });
    describe("partial input", () => {
      test("is valid", () => {
        const partial = getVariantFromArgs("Brown-Fives & Prism".split(" "));
        expect(getVariantFromPartial(partial)).toBe(target);
      });
    });
    describe("many starting or middle spaces", () => {
      test("is valid", () => {
        // eslint-disable-next-line prettier/prettier
        const partial = getVariantFromArgs("   Brown-Fives   & Prism   (6   Suits)".split(" "));
        expect(getVariantFromPartial(partial)).toBe(target);
      });
    });
    describe("spaces before or after -, &, (, )", () => {
      test("is valid", () => {
        // eslint-disable-next-line prettier/prettier
        const partial = getVariantFromArgs("   Brown -Fives& Prism(  6 Suits   )  ".split(" "));
        expect(getVariantFromPartial(partial)).toBe(target);
      });
    });
    describe("capitalize", () => {
      test("is valid", () => {
        // eslint-disable-next-line prettier/prettier
        const partial = getVariantFromArgs("bROWN-FivES & prism (6 SUITS)".split(" "));
        expect(getVariantFromPartial(partial)).toBe(target);
      });
    });
    describe("capitalize", () => {
      test("is valid", () => {
        // eslint-disable-next-line prettier/prettier
        const partial = getVariantFromArgs("bROWN-FivES & prism (6 SUITS)".split(" "));
        expect(getVariantFromPartial(partial)).toBe(target);
      });
    });
    describe("all possible cases", () => {
      test("is valid", () => {
        // eslint-disable-next-line prettier/prettier
        const partial = getVariantFromArgs("  bROWN -FivES   &prism(6 suits )".split(" "));
        expect(getVariantFromPartial(partial)).toBe(target);
      });
    });
  });
});
