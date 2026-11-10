// Tailwind classes for the lobby's custom cursors, which "public/css/tokens.css" defines. Each
// class is written out in full so that Tailwind can find it.

/** A table that we are already in. */
export const REJOIN_CURSOR = "tw:hover:cursor-(--cursor-rejoin)";

/** A table that we can join. */
export const JOIN_CURSOR = "tw:hover:cursor-(--cursor-join)";

/** A table that has no free seat. */
export const FULL_CURSOR = "tw:hover:cursor-(--cursor-full)";

/** Something that we can spectate. */
export const SPECTATE_CURSOR = "tw:cursor-(--cursor-spectate)";

/** A player name that a spectator can click to see the game as that player sees it. */
export const SHADOW_NAME =
  "tw:hover:cursor-(--cursor-shadow) tw:hover:text-name-hover";

/** The player name that a spectator shadows, which they can click to stop. */
export const UN_SHADOW_NAME =
  "tw:hover:cursor-(--cursor-un-shadow) tw:hover:text-name-hover";
