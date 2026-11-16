/**
 * The two kinds of boxes on the game screen. A readout, such as the clue tokens, sits in the table,
 * and a button stands on it, so that a player can tell at a glance which boxes do something.
 */

/**
 * The edges of a well: the shadow that its top edge casts into it, and the light on its bottom
 * edge.
 */
const WELL_EDGES_CLASS =
  "tw:inset-shadow-[0_3px_10px_rgb(0_0_0/55%)] tw:shadow-[0_1px_0_rgb(255_255_255/12%)]";

/**
 * A readout: a well cut into the felt. Its top edge casts a shadow into it, and light catches its
 * bottom edge.
 */
export const WELL_CLASS = `tw:bg-game-well ${WELL_EDGES_CLASS}`;

/**
 * A place to drop the held card, such as the play stacks: a well that is darker than a readout, so
 * that the player sees where they can drag the card.
 */
export const DROP_ZONE_CLASS = `tw:bg-game-drop-zone ${WELL_EDGES_CLASS}`;

/**
 * A button: a key with a light top edge and a dark lip under it. Pressing it pushes it down onto
 * its lip. The lip is translucent black, so that it suits a button of any color. A disabled button
 * lies flat.
 */
export const KEY_CLASS =
  "tw:inset-shadow-[0_1px_0_rgb(255_255_255/18%)] tw:shadow-[0_3px_0_rgb(0_0_0/35%),0_4px_8px_rgb(0_0_0/25%)] tw:transition-[translate,box-shadow] tw:duration-75 tw:ease-out tw:active:translate-y-[2px] tw:active:shadow-[0_1px_0_rgb(0_0_0/35%)] tw:disabled:translate-y-0 tw:disabled:shadow-none tw:disabled:inset-shadow-none";

/** A button on a bar of the game screen. It sets no color. */
const BAR_BUTTON_CLASS = `tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-game-control tw:border-0 tw:px-4 tw:text-[15px] tw:whitespace-nowrap tw:text-game-text ${KEY_CLASS}`;

/** A button on the bottom bar, which gets smaller on narrow screens. It sets no color. */
export const BOTTOM_BAR_BUTTON_CLASS = `${BAR_BUTTON_CLASS} tw:phone:h-9 tw:phone:px-3 tw:phone:text-sm tw:narrow-530:px-2`;

/**
 * The usual color of a button on the bottom bar. It is translucent, so that it takes the color of
 * the bar in each of the screen's modes.
 */
export const BOTTOM_BAR_BUTTON_COLOR_CLASS =
  "tw:bg-white/8 tw:hover:bg-white/15";

/** A button on the replay bar that is not its main action. */
export const REPLAY_BAR_BUTTON_CLASS = `${BAR_BUTTON_CLASS} tw:justify-center tw:bg-white/8 tw:font-semibold tw:hover:bg-white/15`;

/** The short text at the top of a menu that says what its choices do. */
export const MENU_LABEL_CLASS =
  "tw:px-1 tw:pt-1 tw:text-[13px] tw:text-game-muted";

/**
 * A choice in a menu. Like every button on the game screen, it is a key that stands on the panel,
 * so that it looks like something to press. It sets no color and no layout of its content.
 */
export const MENU_ITEM_CLASS = `tw:min-h-10 tw:w-full tw:rounded-game-control tw:border-0 tw:px-3 tw:py-2 tw:text-left tw:text-[15px] tw:font-semibold tw:enabled:cursor-pointer ${KEY_CLASS}`;

/** The usual color of a choice in a menu. */
export const MENU_ITEM_COLOR_CLASS =
  "tw:bg-white/8 tw:text-game-text tw:enabled:hover:bg-white/15";

/** A choice in a menu that starts with an icon or a check mark, in the usual color. */
export const MENU_ICON_ITEM_CLASS = `tw:flex tw:items-center tw:gap-2.5 ${MENU_ITEM_CLASS} ${MENU_ITEM_COLOR_CLASS}`;

/**
 * The icon at the start of a choice in a menu, as wide as every other, so that the names line up.
 */
export const MENU_ICON_CLASS = "fas tw:w-3.5 tw:text-center";
