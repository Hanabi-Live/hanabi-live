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

/** The size of the text in every column, as a fraction of the entry's height. */
const FONT_SIZE = 0.9;

/**
 * The columns of an entry, as fractions of its width. The giver, the target, and the clue name sit
 * in a row, with `GAP` before each one.
 */
const COLUMN = {
  GAP: 0.05,
  PLAYER_NAME_W: 0.3,
  CLUE_NAME_W: 0.2,
  /**
   * The center of the cross that marks a clue that did not touch the card under the mouse. It
   * overlaps the end of the clue name, near the right edge of the entry.
   */
  NEGATIVE_MARKER_CENTER_X: 0.98,
} as const;

const GIVER_X = COLUMN.GAP;
const TARGET_X = GIVER_X + COLUMN.PLAYER_NAME_W + COLUMN.GAP;
const CLUE_NAME_X = TARGET_X + COLUMN.PLAYER_NAME_W + COLUMN.GAP;

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
    const fontSize = FONT_SIZE * h;
    const playerNameWidth = COLUMN.PLAYER_NAME_W * w;
    const clueNameWidth = COLUMN.CLUE_NAME_W * w;

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
      x: GIVER_X * w,
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
      x: TARGET_X * w,
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
      x: CLUE_NAME_X * w,
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
      x: COLUMN.NEGATIVE_MARKER_CENTER_X * w - clueNameWidth / 2,
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
