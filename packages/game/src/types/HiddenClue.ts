import type { z } from "zod";
import type { clueSchema } from "../generated/protocol.ts";
import type { ClueType } from "./ClueType.ts";

/**
 * A clue as the server sends it in game events and hypothetical moves. The server omits a clue that
 * the recipient may not see.
 */
export type WireClue = z.output<typeof clueSchema>;

/**
 * A clue whose value the server hides from players and shadows, but whose touched-card list it
 * sends. Duck clues and the clues of a Quacker also hide the type. "Cow & Pig" clues keep it.
 * Ordinary spectators and completed replay histories receive the original clue instead.
 */
export interface HiddenClue {
  readonly type: undefined;
  readonly value: undefined;

  /** The clue's type, when the recipient may see it ("Cow & Pig"). */
  readonly visibleType: ClueType | undefined;
}
