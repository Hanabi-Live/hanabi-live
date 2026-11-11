// The menu that the skull button opens, to vote to end the game or to end it now.

import { MIN_PLAYERS } from "@hanabi-live/game";
import Konva from "konva";
import { getCanvasColors } from "../../theme.ts";
import * as tooltips from "../../tooltips.ts";
import { globals } from "./UiGlobals.ts";
import {
  DIALOG_CORNER_RADIUS,
  FONT_FAMILY,
  STAGE_FADE_OPACITY,
  TEXT_SHADOW,
} from "./constants.ts";
import { Button } from "./controls/Button.ts";
import { resetActiveHover } from "./konvaTooltips.ts";

/** Sizes as fractions of the stage width (`w`) or height (everything else). */
const MENU = {
  w: 0.25,
  paddingX: 0.0125,
  paddingTop: 0.02,
  titleFontSize: 0.03,
  countGap: 0.008,
  countFontSize: 0.018,
  buttonsGap: 0.018,
  buttonH: 0.08,
  buttonGap: 0.013,
  paddingBottom: 0.022,
  buttonFontSize: 0.025,
  /** The line under each button's name, which says what the button does. */
  detailFontSize: 0.017,
  arrowW: 0.03,
  arrowH: 0.016,
  /** The gap between the arrow and the skull. */
  skullGap: 0.006,
  /** The closest the menu comes to the edge of the stage. */
  stageMargin: 0.01,
} as const;

/** In pixels. */
const ARROW_OVERLAP = 2;

/** Shows through the dark button background, which makes the button dark red. */
const END_NOW_COLOR = "red";

export class TerminateMenu extends Konva.Group {
  private readonly countText: Konva.Text;
  private readonly voteName: Konva.Text;
  private readonly voteDetail: Konva.Text;

  private readonly skull: Button;

  constructor(skull: Button, winW: number, winH: number) {
    super({ visible: false });
    this.skull = skull;

    // Clicking anywhere outside of the menu only closes it.
    const backdrop = new Konva.Rect({
      width: winW,
      height: winH,
      fill: "black",
      opacity: STAGE_FADE_OPACITY / 2,
    });
    backdrop.on("click tap", () => {
      this.close();
    });
    this.add(backdrop);

    const w = MENU.w * winW;
    const paddingX = MENU.paddingX * winW;
    const buttonW = w - 2 * paddingX;
    const titleY = MENU.paddingTop;
    const countY = titleY + MENU.titleFontSize + MENU.countGap;
    const voteY = countY + MENU.countFontSize + MENU.buttonsGap;
    const endY = voteY + MENU.buttonH + MENU.buttonGap;
    const h = (endY + MENU.buttonH + MENU.paddingBottom) * winH;

    // Point the arrow at the middle of the skull, and keep the menu on the stage.
    const skullBox = skull.getClientRect();
    const skullCenterX = skullBox.x + skullBox.width / 2;
    const margin = MENU.stageMargin * winW;
    const x = Math.min(
      Math.max(skullCenterX - w / 2, margin),
      winW - w - margin,
    );
    const y = skullBox.y - (MENU.skullGap + MENU.arrowH) * winH - h;
    const panel = new Konva.Group({ x, y });
    this.add(panel);

    const fill = getCanvasColors().surfaceArea;
    panel.add(
      new Konva.Rect({
        width: w,
        height: h,
        fill,
        cornerRadius: DIALOG_CORNER_RADIUS * winH,
        shadowColor: "black",
        shadowBlur: 0.02 * winH,
        shadowOpacity: 0.5,
      }),
    );
    const arrowX = skullCenterX - x;
    const arrowHalfW = (MENU.arrowW * winW) / 2;
    // Start the arrow inside the panel, or anti-aliasing leaves a seam between them.
    const arrowTop = h - ARROW_OVERLAP;
    panel.add(
      new Konva.Line({
        points: [
          arrowX - arrowHalfW,
          arrowTop,
          arrowX + arrowHalfW,
          arrowTop,
          arrowX,
          h + MENU.arrowH * winH,
        ],
        closed: true,
        fill,
      }),
    );

    function text(config: Konva.TextConfig) {
      return new Konva.Text({
        width: w,
        align: "center",
        fontFamily: FONT_FAMILY,
        fill: "white",
        ...TEXT_SHADOW,
        listening: false,
        ...config,
      });
    }
    panel.add(
      text({
        y: titleY * winH,
        fontSize: MENU.titleFontSize * winH,
        text: "End the game?",
      }),
    );
    this.countText = text({
      y: countY * winH,
      fontSize: MENU.countFontSize * winH,
    });
    panel.add(this.countText);

    function button(buttonY: number, name: string, detail: string) {
      const group = new Button({
        x: paddingX,
        y: buttonY * winH,
        width: buttonW,
        height: MENU.buttonH * winH,
      });
      const nameFontSize = MENU.buttonFontSize * winH;
      const detailFontSize = MENU.detailFontSize * winH;
      const gap = (MENU.buttonH * winH - nameFontSize - detailFontSize) / 3;
      const nameText = text({
        width: buttonW,
        y: gap,
        fontSize: nameFontSize,
        text: name,
      });
      const detailText = text({
        width: buttonW,
        y: 2 * gap + nameFontSize,
        fontSize: detailFontSize,
        text: detail,
      });
      group.add(nameText, detailText);
      panel.add(group);
      return { group, nameText, detailText };
    }

    const vote = button(voteY, "", "");
    this.voteName = vote.nameText;
    this.voteDetail = vote.detailText;
    vote.group.on("click tap", () => {
      globals.lobby.conn!.send("tableTerminateVote", {
        tableId: globals.lobby.joinedTableId,
      });
      this.close();
    });

    const endNow = button(endY, "End now", "Ends it for everyone right away");
    const endNowColor = new Konva.Rect({
      width: buttonW,
      height: MENU.buttonH * winH,
      cornerRadius: endNow.group.background.cornerRadius(),
      fill: END_NOW_COLOR,
      listening: false,
    });
    endNow.group.add(endNowColor);
    endNowColor.moveToBottom();
    endNow.group.on("click tap", () => {
      globals.lobby.conn!.send("tableTerminate", {
        tableId: globals.lobby.joinedTableId,
      });
      this.close();
    });

    this.update();
  }

  /** Shows the latest votes. */
  update(): void {
    // The server sends the votes when the game loads, so they are missing only for a moment.
    const votes = globals.terminationVotes;
    if (votes === undefined) {
      return;
    }
    this.countText.text(
      votes.numVotes === 0
        ? "No votes yet"
        : `Votes so far: ${votes.numVotes} of ${votes.numVotesNeeded}`,
    );
    this.voteName.text(votes.voted ? "Take back my vote" : "Vote to end");
    this.voteDetail.text(
      `Ends when ${votersText(votes.numVotesNeeded, globals.options.numPlayers)} vote`,
    );
    this.getLayer()?.batchDraw();
  }

  open(): void {
    // The menu covers the skull, so its tooltip would show on top of the menu.
    resetActiveHover(this.skull);
    tooltips.close(`#tooltip-${this.skull.tooltipName}`);
    this.update();
    this.show();
    this.getLayer()?.batchDraw();
  }

  close(): void {
    this.hide();
    this.getLayer()?.batchDraw();
  }
}

function votersText(needed: number, numPlayers: number): string {
  if (needed < numPlayers) {
    return `${needed} of ${numPlayers} players`;
  }
  return numPlayers === MIN_PLAYERS
    ? "both players"
    : `all ${numPlayers} players`;
}
