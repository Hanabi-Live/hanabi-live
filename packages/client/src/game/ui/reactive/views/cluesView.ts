import type { StateClue } from "@hanabi-live/game";
import { msgClueToClue } from "@hanabi-live/game";
import { globals } from "../../UIGlobals.ts";
import * as arrows from "../../arrows.ts";
import { getCardOrStackBase } from "../../getCardOrStackBase.ts";

export function onLastClueOrSegmentChanged(data: {
  clues: readonly StateClue[];
  segment: number | undefined;
}): void {
  updateArrows(data.clues, data.segment, true);
}

export function refreshArrows(animate: boolean): void {
  const { visibleState } = globals.state;
  if (visibleState === undefined) {
    arrows.hideAll();
    return;
  }

  updateArrows(visibleState.clues, visibleState.turn.segment, animate);
}

function updateArrows(
  clues: readonly StateClue[],
  segment: number | undefined,
  animate: boolean,
) {
  arrows.hideAll();

  if (segment === undefined) {
    return;
  }

  const clueForSegment = getClueForSegment(clues, segment);
  if (clueForSegment === undefined) {
    return;
  }

  const clue =
    clueForSegment.type === undefined
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
