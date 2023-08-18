import equal from "fast-deep-equal";
import { newColorClue, newRankClue } from "../../../types/Clue";
import { ClueType } from "../../../types/ClueType";
import type { StateClue } from "../../../types/GameState";
import { ClueEntry } from "../../ClueEntry";
import * as arrows from "../../arrows";
import { getCardOrStackBase } from "../../getCardOrStackBase";
import { globals } from "../../globals";

export function onCluesChanged(clues: readonly StateClue[]): void {
  updateLog(clues);
}

export function onLastClueOrSegmentChanged(data: {
  lastClue: StateClue | undefined;
  segment: number | null;
}): void {
  updateArrows(data.lastClue, data.segment);
}

function updateArrows(lastClue: StateClue | undefined, segment: number | null) {
  arrows.hideAll();

  if (segment === null) {
    return;
  }

  if (lastClue === undefined || lastClue.segment !== segment - 1) {
    // We are initializing (or we rewinded and just removed the first clue).
    return;
  }

  const clue =
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    lastClue.type === ClueType.Rank
      ? newRankClue(lastClue.value)
      : newColorClue(globals.variant.clueColors[lastClue.value]!);

  for (const [i, order] of lastClue.list.entries()) {
    const card = getCardOrStackBase(order);
    if (card) {
      arrows.set(i, card, lastClue.giver, clue);
    }
  }

  globals.layers.arrow.batchDraw();
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
