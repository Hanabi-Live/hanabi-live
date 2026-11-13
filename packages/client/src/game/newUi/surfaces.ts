/**
 * The two kinds of boxes on the game screen. A readout, such as the clue tokens, sits in the table,
 * and a button stands on it, so that a player can tell at a glance which boxes do something.
 */

/** A readout: a well cut into the felt, with a shadow along its top edge. */
export const WELL_CLASS =
  "tw:bg-game-well tw:inset-shadow-[0_1px_4px_rgb(0_0_0/35%)]";

/**
 * A button: a key with a light top edge and a dark lip under it. Pressing it pushes it down onto
 * its lip. The lip is translucent black, so that it suits a button of any color. A disabled button
 * lies flat.
 */
export const KEY_CLASS =
  "tw:inset-shadow-[0_1px_0_rgb(255_255_255/18%)] tw:shadow-[0_3px_0_rgb(0_0_0/35%),0_4px_8px_rgb(0_0_0/25%)] tw:transition-[translate,box-shadow] tw:duration-75 tw:ease-out tw:active:translate-y-[2px] tw:active:shadow-[0_1px_0_rgb(0_0_0/35%)] tw:disabled:translate-y-0 tw:disabled:shadow-none tw:disabled:inset-shadow-none";
