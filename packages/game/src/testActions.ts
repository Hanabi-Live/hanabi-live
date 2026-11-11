import { identityField } from "./cardEventIdentity.ts";
import type { CardOrder } from "./types/CardOrder.ts";
import type { ColorIndex } from "./types/ColorIndex.ts";
import type { PlayerIndex } from "./types/PlayerIndex.ts";
import type { Rank } from "./types/Rank.ts";
import type { RankClueNumber } from "./types/RankClueNumber.ts";
import type { SuitIndex } from "./types/SuitIndex.ts";
import type {
  ActionCardIdentity,
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
} from "./types/gameActions.ts";

/** Helper functions to build a color `ActionClue` with a compact syntax. For use in tests. */
export function colorClue(
  value: ColorIndex,
  giver: PlayerIndex,
  list: readonly number[], // We do not want to force the consumer to brand their numbers.
  target: PlayerIndex,
): ActionClue {
  return {
    type: "clue",
    clue: {
      type: "color",
      value,
    },
    playerIndex: giver,
    orders: list as CardOrder[],
    target,
    ignoreNegative: false,
  };
}

/** Helper functions to build a rank `ActionClue` with a compact syntax. For use in tests. */
export function rankClue(
  value: RankClueNumber,
  giver: PlayerIndex,
  list: readonly number[], // We do not want to force the consumer to brand their numbers.
  target: PlayerIndex,
): ActionClue {
  return {
    type: "clue",
    clue: {
      type: "rank",
      value,
    },
    playerIndex: giver,
    orders: list as CardOrder[],
    target,
    ignoreNegative: false,
  };
}

/** Helper functions to build a `ActionDraw` with a compact syntax. For use in tests. */
export function draw(
  playerIndex: PlayerIndex,
  order: number, // We do not want to force the consumer to brand their numbers.
  suitIndex?: SuitIndex,
  rank?: Rank,
): ActionDraw {
  return {
    type: "draw",
    playerIndex,
    order: order as CardOrder,
    ...identityField({ suitIndex, rank }),
  };
}

/** Helper functions to build a `ActionDiscard` with a compact syntax. For use in tests. */
export function discard(
  playerIndex: PlayerIndex,
  order: number, // We do not want to force the consumer to brand their numbers.
  suitIndex: SuitIndex | undefined,
  rank: Rank | undefined,
  failed: boolean,
): ActionDiscard {
  return {
    type: "discard",
    playerIndex,
    order: order as CardOrder,
    ...identityField({ suitIndex, rank }),
    failed,
  };
}

/** Helper functions to build a `ActionPlay` with a compact syntax. For use in tests. */
export function play(
  playerIndex: PlayerIndex,
  order: number, // We do not want to force the consumer to brand their numbers.
  suitIndex: SuitIndex,
  rank: Rank,
): ActionPlay {
  return {
    type: "play",
    playerIndex,
    order: order as CardOrder,
    ...identityField({ suitIndex, rank }),
  };
}

/** Helper functions to build a `ActionCardIdentity` with a compact syntax. For use in tests. */
export function actionCardIdentity(
  playerIndex: PlayerIndex,
  order: number, // We do not want to force the consumer to brand their numbers.
  suitIndex: SuitIndex,
  rank: Rank,
): ActionCardIdentity {
  return {
    type: "cardIdentity",
    playerIndex,
    order: order as CardOrder,
    ...identityField({ suitIndex, rank }),
  };
}
