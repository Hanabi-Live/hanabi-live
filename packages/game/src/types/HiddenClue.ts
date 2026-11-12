import type { z } from "zod";
import type { clueSchema } from "../generated/protocol.ts";

/**
 * A clue as the server sends it in game events and hypothetical moves. The server omits a clue that
 * the recipient may not see.
 */
export type WireClue = z.output<typeof clueSchema>;

/**
 * Live Duck clues conceal both fields for players and shadows, but retain the touched-card list.
 * Ordinary spectators and completed replay histories receive the original clue instead.
 */
export interface HiddenClue {
  readonly type: undefined;
  readonly value: undefined;
}
