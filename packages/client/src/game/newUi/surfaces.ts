/**
 * The two kinds of boxes on the game screen. A readout, such as the clue tokens, sits in the table,
 * and a button stands on it, so that a player can tell at a glance which boxes do something.
 */

/**
 * A readout: a well cut into the felt. Its top edge casts a shadow into it, and light catches its
 * bottom edge.
 */
export const WELL_CLASS =
  "tw:bg-game-well tw:inset-shadow-[0_3px_10px_rgb(0_0_0/55%)] tw:shadow-[0_1px_0_rgb(255_255_255/12%)]";

/**
 * A button: a key with a light top edge and a dark lip under it. Pressing it pushes it down onto
 * its lip. The lip is translucent black, so that it suits a button of any color. A disabled button
 * lies flat.
 */
export const KEY_CLASS =
  "tw:inset-shadow-[0_1px_0_rgb(255_255_255/18%)] tw:shadow-[0_3px_0_rgb(0_0_0/35%),0_4px_8px_rgb(0_0_0/25%)] tw:transition-[translate,box-shadow] tw:duration-75 tw:ease-out tw:active:translate-y-[2px] tw:active:shadow-[0_1px_0_rgb(0_0_0/35%)] tw:disabled:translate-y-0 tw:disabled:shadow-none tw:disabled:inset-shadow-none";

/**
 * A menu that opens above its button. Its bottom has more room, so that the lip of the last key in
 * it does not touch the edge.
 */
export const MENU_CLASS =
  "tw:absolute tw:bottom-full tw:z-30 tw:mb-2 tw:flex tw:flex-col tw:gap-2 tw:rounded-[14px] tw:bg-game-panel tw:p-2 tw:pb-3 tw:shadow-lg tw:ring-1 tw:ring-game-line";

/** The short text at the top of a menu that says what its choices do. */
export const MENU_LABEL_CLASS =
  "tw:px-1 tw:pt-1 tw:text-[13px] tw:text-game-muted";

/**
 * A choice in a menu. Like every button on the game screen, it is a key that stands on the panel,
 * so that it looks like something to press. It sets no color and no layout of its content.
 */
export const MENU_ITEM_CLASS = `tw:min-h-10 tw:w-full tw:rounded-lg tw:border-0 tw:px-3 tw:py-2 tw:text-left tw:text-[15px] tw:font-semibold tw:enabled:cursor-pointer ${KEY_CLASS}`;

/** The usual color of a choice in a menu. */
export const MENU_ITEM_COLOR_CLASS =
  "tw:bg-white/8 tw:text-game-text tw:enabled:hover:bg-white/15";
