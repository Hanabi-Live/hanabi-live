import { hasDiacritic, hasEmoji } from "./string";

describe("hasEmoji", () => {
  test("should return true for string with emoji", () => {
    expect(hasEmoji("Hello 😃 World")).toBe(true);
    expect(hasEmoji("This is a 🌟 test")).toBe(true);
  });

  test("should return false for string without emoji", () => {
    expect(hasEmoji("Hello World")).toBe(false);
    expect(hasEmoji("No emoji here!")).toBe(false);
  });

  test("should handle empty string", () => {
    expect(hasEmoji("")).toBe(false);
  });

  test("should handle strings with only emoji", () => {
    expect(hasEmoji("😊")).toBe(true);
    expect(hasEmoji("🚀")).toBe(true);
  });
});

describe("hasDiacritic", () => {
  test("should return true for diacritic character", () => {
    expect(hasDiacritic("á")).toBe(true);
    expect(hasDiacritic("è")).toBe(true);
    expect(hasDiacritic("ô")).toBe(true);
  });

  test("should return false for non-diacritic character", () => {
    expect(hasDiacritic("A")).toBe(false);
    expect(hasDiacritic("1")).toBe(false);
    expect(hasDiacritic("!")).toBe(false);
  });

  test("should handle empty string", () => {
    expect(hasDiacritic("")).toBe(false);
  });
});
