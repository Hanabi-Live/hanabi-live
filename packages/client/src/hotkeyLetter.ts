// The letter of a hotkey, read without the deprecated `event.which`.

/** Chromium's Keyboard API, which the DOM types of TypeScript leave out. */
interface NavigatorKeyboard {
  readonly keyboard?: {
    readonly getLayoutMap: () => Promise<ReadonlyMap<string, string>>;
  };
}

const LETTER = /^[a-z]$/u;

/** A letter key, as `event.code` names it. The letter is the one on a US keyboard. */
const LETTER_KEY_CODE = /^Key(?<letter>[A-Z])$/u;

/** What each key types alone on the player's keyboard layout, once Chromium gives it. */
let layoutMap: ReadonlyMap<string, string> | undefined;

/** Asks for the keyboard layout. Call it before the first hotkey, so that the layout is ready. */
export function loadKeyboardLayout(): void {
  const { keyboard } = navigator as Navigator & NavigatorKeyboard;
  keyboard?.getLayoutMap().then(
    (map) => {
      layoutMap = map;
    },
    () => {
      // A page in a frame cannot read the layout. The US letters then apply.
    },
  );
}

/**
 * The letter that a key press types, in lower case, or `undefined` if the key is not a letter.
 *
 * `event.key` gives the letter on most systems. On macOS, Option (Alt) makes the key type a symbol,
 * such as an integral sign for B, so we ask the keyboard layout what the key types alone. If that
 * is not a Latin letter either, as on a Russian layout, we use the letter that the key has on a US
 * keyboard.
 */
export function getHotkeyLetter(
  event: Pick<KeyboardEvent, "code" | "key">,
): string | undefined {
  const key = event.key.toLowerCase();
  if (LETTER.test(key)) {
    return key;
  }

  const usLetter = LETTER_KEY_CODE.exec(event.code)?.groups?.[
    "letter"
  ]?.toLowerCase();
  if (usLetter === undefined) {
    return undefined;
  }

  // The player may have changed the layout since we last read it.
  loadKeyboardLayout();
  const layoutLetter = layoutMap?.get(event.code)?.toLowerCase();
  return layoutLetter !== undefined && LETTER.test(layoutLetter)
    ? layoutLetter
    : usLetter;
}
