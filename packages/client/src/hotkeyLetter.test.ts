import { expect, test } from "vitest";
import { getHotkeyLetter } from "./hotkeyLetter.ts";

test("a letter key gives its letter in lower case", () => {
  expect(
    getHotkeyLetter({
      code: "KeyB",
      key: "b",
    }),
  ).toBe("b");
  expect(
    getHotkeyLetter({
      code: "KeyB",
      key: "B",
    }),
  ).toBe("b");
  // On a French keyboard, the key where a US keyboard has Q types "a".
  expect(
    getHotkeyLetter({
      code: "KeyQ",
      key: "a",
    }),
  ).toBe("a");
});

test("a letter key that types something else gives its US letter", () => {
  // On macOS, Option + B types an integral sign.
  expect(
    getHotkeyLetter({
      code: "KeyB",
      key: "\u{222B}",
    }),
  ).toBe("b");
  // On macOS, Option + N starts an accent, which the next key gets.
  expect(
    getHotkeyLetter({
      code: "KeyN",
      key: "Dead",
    }),
  ).toBe("n");
  // On a Russian keyboard, the C key types the Cyrillic letter "es".
  expect(
    getHotkeyLetter({
      code: "KeyC",
      key: "\u{441}",
    }),
  ).toBe("c");
});

test("other keys give no letter", () => {
  expect(
    getHotkeyLetter({
      code: "Digit1",
      key: "1",
    }),
  ).toBeUndefined();
  expect(
    getHotkeyLetter({
      code: "Enter",
      key: "Enter",
    }),
  ).toBeUndefined();
});
