import type { StateClue } from "@hanabi-live/game";
import { msgClueToClue } from "@hanabi-live/game";
import equal from "fast-deep-equal";
import { ClueEntry } from "../../ClueEntry";
import { globals } from "../../UIGlobals";
import * as arrows from "../../arrows";
import { getCardOrStackBase } from "../../getCardOrStackBase";

export function onCluesChanged(clues: readonly StateClue[]): void {
  updateLog(clues);
}

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

  const clue = msgClueToClue(clueForSegment, globals.variant);

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

function updateLog(clues: readonly StateClue[]) {
  const { clueLog } = globals.elements;
  if (clueLog === null) {
    return;
  }

  const startingIndex = Math.max(0, clues.length - clueLog.maxLength);
  for (const [i, clue] of clues.slice(startingIndex).entries()) {
    if (i < clueLog.children.length) {
      const clueEntry = clueLog.children[i] as unknown as ClueEntry;
      if (equal(clue, clueEntry.clue)) {
        // No change
        continue;
      }
    }

    const entry = new ClueEntry(clue, {
      width: clueLog.width(),
      height: 0.017 * globals.stage.height(),
      listening: false,
    });
    if (i < clueLog.children.length) {
      clueLog.updateClue(i, entry);
    } else {
      clueLog.addClue(entry);
    }
  }

  // Delete any left over clues.
  if (clueLog.children.length > clues.length) {
    clueLog.children.splice(
      clues.length,
      clueLog.children.length - clues.length,
    );
  }
  clueLog.refresh();

  globals.layers.UI.batchDraw();
}
