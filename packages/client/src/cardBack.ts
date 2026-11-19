// The look of the back of a card, which the game screen and the lobby share.

/**
 * The back of a card: dark ink with a faint diagonal lattice, so that a pile of them reads as
 * face-down cards. The deck, a card with a "blank" note, and the open seats of a pre-game table use
 * it.
 */
export const CARD_BACK_STYLE = {
  backgroundColor: "var(--card-ink)",
  backgroundImage: [
    "repeating-linear-gradient(45deg, rgb(255 255 255 / 7%) 0 1px, transparent 1px 7px)",
    "repeating-linear-gradient(-45deg, rgb(255 255 255 / 7%) 0 1px, transparent 1px 7px)",
  ].join(", "),
} as const;
