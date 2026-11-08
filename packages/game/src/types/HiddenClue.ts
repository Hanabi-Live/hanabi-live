import type { z } from "zod";
import type { hypotheticalActionSchema } from "../generated/protocol";

/** A clue as the server sends it in game events and hypothetical moves. */
export type WireClue = Extract<
  z.output<typeof hypotheticalActionSchema>,
  { type: "clue" }
>["clue"];

/**
 * Live Duck clues conceal both fields for players and shadows, but retain the touched-card list.
 * Ordinary spectators and completed replay histories receive the original clue instead.
 */
export type HiddenClue = Readonly<Extract<WireClue, { type: -1 }>>;
