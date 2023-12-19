// This is one of the entries in the clue log (in the top-right-hand corner of the UI).

import type { CardOrder, StateClue } from "@hanabi/game";
import { getCharacterNameForPlayer } from "@hanabi/game";
import { assertDefined } from "isaacscript-common-ts";
import Konva from "konva";
import * as cluesRules from "../rules/clues";
import { globals } from "./UIGlobals";
import { FitText } from "./controls/FitText";
import { drawLayer } from "./konvaHelpers";
import * as replay from "./replay";

export class ClueEntry extends Konva.Group {
  clue: StateClue;

  background: Konva.Rect;
  negativeMarker: Konva.Text;

  constructor(clue: StateClue, config: Konva.ContainerConfig) {
    super(config);

    this.clue = clue;

    // Object variables
    const w = config.width;
    assertDefined(w, 'ClueEntry was not provided with a "width" value.');
    const h = config.height;
    assertDefined(h, 'ClueEntry was not provided with a "height" value.');

    this.background = new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: h,
      fill: "white",
      opacity: 0.1,
      listening: true,
    });
    this.add(this.background);

    const giver = new FitText({
      x: 0.05 * w,
      y: 0,
      width: 0.3 * w,
      height: h,
      fontSize: 0.9 * h,
      fontFamily: "Verdana",
      fill: "white",
      text: globals.metadata.playerNames[clue.giver],
      verticalAlign: "middle",
      listening: false,
    });
    this.add(giver);

    const target = new FitText({
      x: 0.4 * w,
      y: 0,
      width: 0.3 * w,
      height: h,
      fontSize: 0.9 * h,
      fontFamily: "Verdana",
      fill: "white",
      text: globals.metadata.playerNames[clue.target],
      verticalAlign: "middle",
      listening: false,
    });
    this.add(target);

    const characterName = getCharacterNameForPlayer(
      clue.giver,
      globals.metadata.characterAssignments,
    );
    const name = new Konva.Text({
      x: 0.75 * w,
      y: 0,
      width: 0.2 * w,
      height: h,
      align: "center",
      fontSize: 0.9 * h,
      fontFamily: "Verdana",
      fill: "white",
      text: cluesRules.getClueName(
        clue.type,
        clue.value,
        globals.variant,
        characterName,
      ),
      verticalAlign: "middle",
      listening: false,
    });
    this.add(name);

    this.negativeMarker = new Konva.Text({
      x: 0.88 * w,
      y: 0,
      width: 0.2 * w,
      height: h,
      align: "center",
      fontSize: 0.9 * h,
      fontFamily: "Verdana",
      fill: "white",
      text: "✘",
      visible: false,
      listening: false,
    });
    this.add(this.negativeMarker);

    // Add a mouseover highlighting effect.
    this.background.on("mouseover", () => {
      this.background.opacity(0.4);
      drawLayer(this);
    });
    this.background.on("mouseout", () => {
      this.background.opacity(0.1);
      drawLayer(this);
    });

    // Click an entry in the clue log to go to that segment (turn) in the replay.
    this.background.on("click tap", () => {
      replay.goToSegment(this.clue.segment + 1, true);
    });
  }

  /**
   * If this clue entry is related to the card that we are currently mousing over, then highlight
   * it.
   */
  showMatch(targetCardOrder: CardOrder | null): void {
    this.background.opacity(0.1);
    this.background.fill("white");
    this.negativeMarker.hide();

    if (targetCardOrder === null) {
      return;
    }

    for (const cardOrder of this.clue.list) {
      if (cardOrder === targetCardOrder) {
        this.background.opacity(0.4);
        // (The background is already set to white.)
        return;
      }
    }

    for (const cardOrder of this.clue.negativeList) {
      if (cardOrder === targetCardOrder) {
        this.background.opacity(0.4);
        this.background.fill("#ff7777");
        if (globals.lobby.settings.colorblindMode) {
          this.negativeMarker.show();
        }
        return;
      }
    }
  }
}
