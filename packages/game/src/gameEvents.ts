// Converts the game events that the server sends into the actions that the game state applies.

import type { z } from "zod";
import type {
  gameEventSchema,
  hypotheticalEventSchema,
  visibleClueSchema,
} from "./generated/protocol.ts";
import type { ActionIncludingHypothetical } from "./hypotheticalState.ts";
import type { GameAction } from "./types/gameActions.ts";
import type { HiddenClue } from "./types/HiddenClue.ts";
import type { MsgClue } from "./types/MsgClue.ts";

type GameEvent = z.output<typeof gameEventSchema>;
type HypotheticalEvent = z.output<typeof hypotheticalEventSchema>;

/**
 * The server omits a clue that the recipient may not see, and the clue's value when the recipient
 * may see only its type. The game state keeps its giver.
 */
function toClue(
  clue: z.output<typeof visibleClueSchema> | undefined,
): HiddenClue | MsgClue {
  if (clue === undefined) {
    return { type: undefined, value: undefined, visibleType: undefined };
  }
  switch (clue.type) {
    case "color": {
      return clue.color === undefined
        ? { type: undefined, value: undefined, visibleType: "color" }
        : { type: "color", color: clue.color };
    }

    case "rank": {
      return clue.rank === undefined
        ? { type: undefined, value: undefined, visibleType: "rank" }
        : { type: "rank", rank: clue.rank };
    }
  }
}

/** Converts a game event into the action that the game state applies. */
export function toGameAction(event: GameEvent): GameAction {
  if (event.type !== "clue") {
    return event;
  }
  const { clue, ...rest } = event;
  return { ...rest, clue: toClue(clue), ignoreNegative: false };
}

/** Converts a hypothetical event into the action that the game state applies. */
export function toHypotheticalAction(
  event: HypotheticalEvent,
): ActionIncludingHypothetical {
  if (event.type !== "clue") {
    return event;
  }
  const { clue, ...rest } = event;
  return { ...rest, clue: toClue(clue) };
}
