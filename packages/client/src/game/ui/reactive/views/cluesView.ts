import type { StateClue } from "@hanabi-live/game";
import { msgClueToClue, NO_VALUE } from "@hanabi-live/game";
import { globals } from "../../UIGlobals";
import * as arrows from "../../arrows";
import { getCardOrStackBase } from "../../getCardOrStackBase";

export function onLastClueOrSegmentChanged(data: {
  clues: readonly StateClue[];
  segment: number | null;
}): void {
  updateArrows(data.clues, data.segment, true);
}

export function refreshArrows(animate: boolean): void {
  const { visibleState } = globals.state;
  if (visibleState === null) {
    arrows.hideAll();
    return;
  }

  updateArrows(visibleState.clues, visibleState.turn.segment, animate);
}

function updateArrows(
  clues: readonly StateClue[],
  segment: number | null,
  animate: boolean,
) {
  arrows.hideAll();

  if (segment === null) {
    return;
  }

  const clueForSegment = getClueForSegment(clues, segment);
  if (clueForSegment === undefined) {
    return;
  }

  const clue =
    clueForSegment.type === NO_VALUE
      ? clueForSegment
      : msgClueToClue(clueForSegment, globals.variant);

  for (const [i, order] of clueForSegment.list.entries()) {
    const card = getCardOrStackBase(order);
    if (card) {
      arrows.set(i, card, clueForSegment.giver, clue, false, !animate);
    }
  }

  globals.layers.arrow.batchDraw();
}

function getClueForSegment(
  clues: readonly StateClue[],
  segment: number,
): StateClue | undefined {
  // The segment we are currently looking at is `segment`. The clue that resulted in this state (if
  // any) would have `clue.segment === segment - 1`.
  const targetSegment = segment - 1;
  return clues.findLast((clue) => clue.segment === targetSegment);
}
