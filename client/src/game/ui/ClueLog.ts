// This is the list of clues in the top-right-hand corner of the UI

import Konva from "konva";
import ClueEntry from "./ClueEntry";
import globals from "./globals";

export default class ClueLog extends Konva.Group {
  readonly maxLength = 27; // Just enough to fill the parent rectangle

  addClue(clue: ClueEntry): void {
    this.add((clue as unknown) as Konva.Group);
  }

  updateClue(index: number, clue: ClueEntry): void {
    this.children.toArray()[index] = clue;
  }

  refresh(): void {
    this.truncateExcessClueEntries();
    this.doLayout();
  }

  _setChildrenIndices(): void {
    Konva.Group.prototype._setChildrenIndices.call(this);
    this.doLayout();
  }

  private doLayout() {
    let y = 0;
    for (let i = 0; i < this.children.length; i++) {
      const node = this.children[i];
      node.y(y);
      y += node.height() + 0.001 * globals.stage.height();
    }
  }

  // In a 2-player game,
  // it is possible for there to be so many clues in the game such that it overflows the clue log
  // So, if it is overflowing, then remove the earliest clues to make room for the latest clues
  private truncateExcessClueEntries() {
    while (this.children.length - this.maxLength >= 1) {
      this.children[0].remove();
    }
  }

  // We have moused over a card (or stopped mousing over a card),
  // so update the highlighting for all of the clue log entries
  showMatches(targetCardOrder: number | null): void {
    for (const child of this.children.toArray() as ClueEntry[]) {
      child.showMatch(targetCardOrder);
    }
  }
}
