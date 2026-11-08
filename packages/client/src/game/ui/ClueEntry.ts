// This is one of the entries in the clue log (in the top-right-hand corner of the UI).

import type { CardOrder, StateClue } from "@hanabi-live/game";
import { getCharacterNameForPlayer, getClueName } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import Konva from "konva";
import { globals } from "./UIGlobals";
import { FONT_FAMILY } from "./constants";
import { FitText } from "./controls/FitText";
import { drawLayer } from "./konvaHelpers";
import * as replay from "./replay";

const BACKGROUND_OPACITY = 0.1;

/** The opacity of an entry under the mouse or related to the card under the mouse. */
const HIGHLIGHT_OPACITY = 0.4;

/** Light red, for an entry whose clue did not touch the card under the mouse. */
const NEGATIVE_HIGHLIGHT_COLOR = "#ff7777";

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

    // Every column of the entry uses the same text size.
    const fontSize = 0.9 * h;
    const playerNameWidth = 0.3 * w;
    const clueNameWidth = 0.2 * w;

    this.background = new Konva.Rect({
      x: 0,
      y: 0,
      width: w,
      height: h,
      fill: "white",
      opacity: BACKGROUND_OPACITY,
      listening: true,
    });
    this.add(this.background);

    const giver = new FitText({
      x: 0.05 * w,
      y: 0,
      width: playerNameWidth,
      height: h,
      fontSize,
      fontFamily: FONT_FAMILY,
      fill: "white",
      text: globals.metadata.playerNames[clue.giver],
      verticalAlign: "middle",
      listening: false,
    });
    this.add(giver);

    const target = new FitText({
      x: 0.4 * w,
      y: 0,
      width: playerNameWidth,
      height: h,
      fontSize,
      fontFamily: FONT_FAMILY,
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
    const clueName = getClueName(
      clue.type,
      clue.value,
      globals.variant,
      characterName,
    );
    const name = new Konva.Text({
      x: 0.75 * w,
      y: 0,
      width: clueNameWidth,
      height: h,
      align: "center",
      fontSize,
      fontFamily: FONT_FAMILY,
      fill: "white",
      text: clueName,
      verticalAlign: "middle",
      listening: false,
    });
    this.add(name);

    this.negativeMarker = new Konva.Text({
      x: 0.88 * w,
      y: 0,
      width: clueNameWidth,
      height: h,
      align: "center",
      fontSize,
      fontFamily: FONT_FAMILY,
      fill: "white",
      text: "✘", // eslint-disable-line complete/require-ascii
      visible: false,
      listening: false,
    });
    this.add(this.negativeMarker);

    // Add a mouseover highlighting effect.
    this.background.on("mouseover", () => {
      this.background.opacity(HIGHLIGHT_OPACITY);
      drawLayer(this);
    });
    this.background.on("mouseout", () => {
      this.background.opacity(BACKGROUND_OPACITY);
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
    this.background.opacity(BACKGROUND_OPACITY);
    this.background.fill("white");
    this.negativeMarker.hide();

    if (targetCardOrder === null) {
      return;
    }

    for (const cardOrder of this.clue.list) {
      if (cardOrder === targetCardOrder) {
        this.background.opacity(HIGHLIGHT_OPACITY);
        // (The background is already set to white.)
        return;
      }
    }

    for (const cardOrder of this.clue.negativeList) {
      if (cardOrder === targetCardOrder) {
        this.background.opacity(HIGHLIGHT_OPACITY);
        this.background.fill(NEGATIVE_HIGHLIGHT_COLOR);
        if (globals.lobby.settings.colorblindMode) {
          this.negativeMarker.show();
        }
        return;
      }
    }
  }
}
