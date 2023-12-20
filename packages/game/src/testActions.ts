import { ClueType } from "./enums/ClueType";
import type { CardOrder } from "./types/CardOrder";
import type { ColorIndex } from "./types/ColorIndex";
import type { PlayerIndex } from "./types/PlayerIndex";
import type { Rank } from "./types/Rank";
import type { RankClueNumber } from "./types/RankClueNumber";
import type { SuitIndex } from "./types/SuitIndex";
import type {
  ActionCardIdentity,
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
  ActionStrike,
} from "./types/gameActions";

/** Helper functions to build a color `ActionClue` with a compact syntax. For use in tests. */
export function colorClue(
  value: ColorIndex,
  giver: PlayerIndex,
  list: readonly number[],
  target: PlayerIndex,
  turn: number,
): ActionClue {
  return {
    type: "clue",
    clue: {
      type: ClueType.Color,
      value,
    },
    giver,
    list: list as CardOrder[],
    target,
    turn,
    ignoreNegative: false,
  };
}

/** Helper functions to build a rank `ActionClue` with a compact syntax. For use in tests. */
export function rankClue(
  value: RankClueNumber,
  giver: PlayerIndex,
  list: readonly number[],
  target: PlayerIndex,
  turn: number,
): ActionClue {
  return {
    type: "clue",
    clue: {
      type: ClueType.Rank,
      value,
    },
    giver,
    list: list as CardOrder[],
    target,
    turn,
    ignoreNegative: false,
  };
}

/** Helper functions to build a `ActionDraw` with a compact syntax. For use in tests. */
export function draw(
  playerIndex: PlayerIndex,
  order: number,
  suitIndex: SuitIndex | -1 = -1,
  rank: Rank | -1 = -1,
): ActionDraw {
  return {
    type: "draw",
    playerIndex,
    order: order as CardOrder,
    suitIndex,
    rank,
  };
}

/** Helper functions to build a `ActionDiscard` with a compact syntax. For use in tests. */
export function discard(
  playerIndex: PlayerIndex,
  order: number,
  suitIndex: SuitIndex | -1,
  rank: Rank | -1,
  failed: boolean,
): ActionDiscard {
  return {
    type: "discard",
    playerIndex,
    order: order as CardOrder,
    suitIndex,
    rank,
    failed,
  };
}

/** Helper functions to build a `ActionPlay` with a compact syntax. For use in tests. */
export function play(
  playerIndex: PlayerIndex,
  order: number,
  suitIndex: SuitIndex,
  rank: Rank,
): ActionPlay {
  return {
    type: "play",
    playerIndex,
    order: order as CardOrder,
    suitIndex,
    rank,
  };
}

/** Helper functions to build a `ActionCardIdentity` with a compact syntax. For use in tests. */
export function cardIdentity(
  playerIndex: PlayerIndex,
  order: number,
  suitIndex: SuitIndex,
  rank: Rank,
): ActionCardIdentity {
  return {
    type: "cardIdentity",
    playerIndex,
    order: order as CardOrder,
    suitIndex,
    rank,
  };
}

/** Helper functions to build a `ActionStrike` with a compact syntax. For use in tests. */
export function strike(
  num: 1 | 2 | 3,
  order: number,
  turn: number,
): ActionStrike {
  return {
    type: "strike",
    num,
    order: order as CardOrder,
    turn,
  };
}
