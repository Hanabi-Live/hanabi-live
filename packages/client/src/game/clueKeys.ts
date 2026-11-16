// The keys that choose a clue, on both game screens.

import { getHotkeyLetter } from "../hotkeyLetter.ts";

/**
 * The keys that choose a color clue, in the order of the variant's colors, as on the classic
 * screen. They sit next to the number keys, which choose a rank.
 */
const COLOR_CLUE_KEYS = ["q", "w", "e", "r", "t", "y"] as const;

/** The number keys of the top row and of the number pad, as `event.code` names them. */
const RANK_KEY_CODE = /^(?:Digit|Numpad)(?<digit>[1-9])$/u;

/**
 * The index of the rank that a number key chooses, if it is one. The top row counts by where the
 * key is, as on the classic screen, so that it works on keyboards that need Shift for the digits,
 * such as French ones. A number pad key counts only while it types a digit: without Num Lock, it is
 * an arrow or Home or End.
 */
export function getRankKeyIndex(
  event: Pick<KeyboardEvent, "code" | "key">,
): number | undefined {
  const digit = RANK_KEY_CODE.exec(event.code)?.groups?.["digit"];
  return digit === undefined
    || (event.code.startsWith("Numpad") && !/^\d$/u.test(event.key))
    ? undefined
    : Number(digit) - 1;
}

/** The index of the color that a letter key chooses, if it is one (see `COLOR_CLUE_KEYS`). */
export function getColorKeyIndex(
  event: Pick<KeyboardEvent, "code" | "key">,
): number | undefined {
  const letter = getHotkeyLetter(event);
  const index = COLOR_CLUE_KEYS.findIndex((key) => key === letter);
  return index === -1 ? undefined : index;
}
