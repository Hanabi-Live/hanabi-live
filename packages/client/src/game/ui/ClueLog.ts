// This is the list of clues in the top-right-hand corner of the UI.

import type { CardOrder } from "@hanabi-live/game";
import { eRange } from "complete-common";
import Konva from "konva";
import type { ClueEntry } from "./ClueEntry";
import { globals } from "./UIGlobals";

/** The height of each clue entry, as a fraction of the stage height. */
export const CLUE_ENTRY_HEIGHT = 0.017;

/** The gap below each clue entry, as a fraction of the stage height. */
const CLUE_ENTRY_GAP = 0.001;

export class ClueLog extends Konva.Group {
  /** The most clue entries that fit in the log. */
  get maxLength(): number {
    const stageHeight = globals.stage.height();
    const gap = CLUE_ENTRY_GAP * stageHeight;
    return Math.floor(
      (this.height() + gap) / (CLUE_ENTRY_HEIGHT * stageHeight + gap),
    );
  }

  addClue(clue: ClueEntry): void {
    this.add(clue as unknown as Konva.Group);
  }

  updateClue(index: number, clue: ClueEntry): void {
    this.children[index]?.remove();
    this.add(clue as unknown as Konva.Group);
    clue.zIndex(index);
  }

  refresh(): void {
    this.truncateExcessClueEntries();
    this.doLayout();
  }

  override _setChildrenIndices(): void {
    Konva.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
  }

  private doLayout() {
    let y = 0;
    for (const i of eRange(this.children.length)) {
      const node = this.children[i]!;
      node.y(y);
      y += node.height() + CLUE_ENTRY_GAP * globals.stage.height();
    }
  }

  // In a 2-player game, it is possible for there to be so many clues in the game such that it
  // overflows the clue log. So, if it is overflowing, then remove the earliest clues to make room
  // for the latest clues.
  private truncateExcessClueEntries() {
    while (this.children.length - this.maxLength >= 1) {
      this.children[0]!.remove();
    }
  }

  // We have moused over a card (or stopped mousing over a card), so update the highlighting for all
  // of the clue log entries.
  showMatches(targetCardOrder: CardOrder | null): void {
    for (const child of this.children.toArray() as ClueEntry[]) {
      child.showMatch(targetCardOrder);
    }
  }
}
