import type { PlayerIndex } from "@hanabi-live/game";
import { isValidPlayerIndex } from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import Konva from "konva";
import * as modals from "../../modals.ts";
import * as tooltips from "../../tooltips.ts";
import { globals } from "./UIGlobals.ts";
import { backToLobby } from "./backToLobby.ts";
import {
  FONT_FAMILY,
  LABEL_COLOR,
  LEFT_MOUSE_BUTTON,
  LINE_SHADOW,
  MIN_FONT_SIZE,
  RIGHT_MOUSE_BUTTON,
  STROKE_WIDTH_UNIT,
  TEXT_SHRINK_FACTOR,
  WARNING_COLOR,
} from "./constants.ts";
import * as konvaTooltips from "./konvaTooltips.ts";

const NAME_SHADOW_OPACITY = 0.9;
const ACTIVE_SHADOW_OPACITY = 0.6;

/** How many times thicker the frame lines are around the name of the player whose turn it is. */
const ACTIVE_STROKE_WIDTH_MULTIPLIER = 3;

/** The widest a player name can be before it shrinks, as a fraction of the name frame width. */
const MAX_NAME_WIDTH_FRACTION = 0.65;

/** The gap between the frame lines on either side of a name, as a multiple of the name width. */
const NAME_LINE_GAP_FACTOR = 1.4;

export class NameFrame extends Konva.Group {
  playerIndex: PlayerIndex;
  tooltipName: string;

  playerName: Konva.Text;
  leftLine: Konva.Line;
  rightLine: Konva.Line;

  defaultStrokeWidth: number;

  constructor(config: Konva.ContainerConfig, playerIndex: PlayerIndex) {
    super(config);
    this.listening(true); // Needed for the hover events

    assertDefined(config.width, "A NameFrame was initialized without a width.");
    assertDefined(
      config.height,
      "A NameFrame was initialized without a height.",
    );

    // Class variables
    this.playerIndex = playerIndex;
    this.tooltipName = `player-${this.playerIndex}`;

    this.playerName = new Konva.Text({
      x: config.width / 2,
      y: 0,
      height: config.height,
      align: "center",
      fontFamily: FONT_FAMILY,
      fontSize: config.height,
      text: config.name,
      fill: LABEL_COLOR,
      ...LINE_SHADOW,
      shadowOpacity: NAME_SHADOW_OPACITY,
      listening: true, // Needed so that we can click on a player's name to shadow them
    });

    let w = this.playerName.width();
    while (
      w > MAX_NAME_WIDTH_FRACTION * config.width
      && this.playerName.fontSize() > MIN_FONT_SIZE
    ) {
      this.playerName.fontSize(this.playerName.fontSize() * TEXT_SHRINK_FACTOR);
      w = this.playerName.width();
    }
    this.playerName.offsetX(w / 2);
    this.playerName.on(
      "click tap",
      (event: Konva.KonvaEventObject<MouseEvent>) => {
        // "event.evt.buttons" is always 0 here.
        if (event.evt.button === LEFT_MOUSE_BUTTON) {
          // Left-click
          this.leftClick();
        } else if (event.evt.button === RIGHT_MOUSE_BUTTON) {
          // Right-click
          this.rightClick();
        }
      },
    );
    this.add(this.playerName);

    w *= NAME_LINE_GAP_FACTOR;

    this.defaultStrokeWidth = STROKE_WIDTH_UNIT * globals.stage.height();

    this.leftLine = new Konva.Line({
      points: [
        0,
        0,
        0,
        config.height / 2,
        config.width / 2 - w / 2,
        config.height / 2,
      ],
      stroke: LABEL_COLOR,
      strokeWidth: this.defaultStrokeWidth,
      lineJoin: "round",
      ...LINE_SHADOW,
      shadowOpacity: 0,
      listening: false,
    });
    this.add(this.leftLine);

    this.rightLine = new Konva.Line({
      points: [
        config.width / 2 + w / 2,
        config.height / 2,
        config.width,
        config.height / 2,
        config.width,
        0,
      ],
      stroke: LABEL_COLOR,
      strokeWidth: this.defaultStrokeWidth,
      lineJoin: "round",
      ...LINE_SHADOW,
      shadowOpacity: 0,
      listening: false,
    });
    this.add(this.rightLine);

    // Draw the tooltips on the player names that show the time. (We do not use the "tooltip.init()"
    // function because we need the extra condition in the "mouseover" and "mouseout" event.)
    this.on("mouseover touchstart", function mouseOver(this: NameFrame) {
      // Do not do anything if the tooltip is currently disabled.
      if (
        globals.lobby.settings.speedrunMode
        || globals.options.speedrun
        || globals.playerTimes[this.playerIndex] === undefined
        || globals.state.finished
        || globals.editingNote !== undefined
      ) {
        return;
      }

      konvaTooltips.setActiveHover(this);
      konvaTooltips.show(this);
    });
    this.on("mouseout touchend", () => {
      konvaTooltips.resetActiveHover(this);
      tooltips.close(`#tooltip-${this.tooltipName}`);
    });
  }

  setActive(active: boolean): void {
    const strokeWidth = active
      ? ACTIVE_STROKE_WIDTH_MULTIPLIER * this.defaultStrokeWidth
      : this.defaultStrokeWidth;
    this.leftLine.strokeWidth(strokeWidth);
    this.rightLine.strokeWidth(strokeWidth);

    this.playerName.shadowOpacity(active ? ACTIVE_SHADOW_OPACITY : 0);
    this.leftLine.shadowOpacity(active ? ACTIVE_SHADOW_OPACITY : 0);
    this.rightLine.shadowOpacity(active ? ACTIVE_SHADOW_OPACITY : 0);

    this.playerName.fontStyle(active ? "bold" : "normal");
  }

  setConnected(connected: boolean): void {
    const color = connected ? LABEL_COLOR : WARNING_COLOR;

    this.leftLine.stroke(color);
    this.rightLine.stroke(color);
    this.playerName.fill(color);
  }

  // Players can left-click on the name frame to see a log of only that player's actions.
  leftClick(): void {
    const username = this.playerName.text();
    globals.elements.fullActionLog!.showPlayerActions(username);
  }

  // Players can right-click on the name frame to assume the perspective of the respective player
  // This function calls "backToLobby()" inside of a "setTimeout" callback to avoid having the
  // right-click context menu come up. (The right-click context menu will be enabled as soon as we
  // execute the "backToLobby()" function.)
  rightClick(): void {
    // Find the index corresponding to this player.
    const playerName = this.playerName.text();
    const shadowingPlayerIndex =
      globals.metadata.playerNames.indexOf(playerName);
    if (!isValidPlayerIndex(shadowingPlayerIndex)) {
      throw new Error(
        `Failed to find the index corresponding to player: ${playerName}`,
      );
    }

    if (!globals.state.playing && !globals.state.finished) {
      // As a spectator in an ongoing game, right-clicking on a name frame reloads the page,
      // shifting the seat and hiding the appropriate cards (so that you can spectate from a
      // specific player's perspective).

      // Validate that we are not shifting to the perspective that we are already at.
      const ourSpectator = globals.state.spectators.find(
        (spectator) => spectator.username === globals.metadata.ourUsername,
      );
      if (shadowingPlayerIndex === ourSpectator?.shadowingPlayerIndex) {
        modals.showWarning(
          "You are already viewing the game from this player's perspective.",
        );
        return;
      }

      setTimeout(() => {
        backToLobby();
        globals.lobby.conn!.send("tableSpectate", {
          tableId: globals.lobby.joinedTableId,
          shadowingPlayerIndex,
        });
      }, 0);
    } else if (globals.state.finished) {
      // In a replay, right-clicking on a name frame reloads the page and shifts the seat (so that
      // you can view the game from a specific player's perspective).

      // Validate that we are not shifting to the perspective that we are already at.
      if (shadowingPlayerIndex === globals.metadata.ourPlayerIndex) {
        modals.showWarning(
          "You are already viewing the game from this player's perspective.",
        );
        return;
      }

      if (globals.state.spectators.length === 1) {
        const { gameId } = globals.state.replay;
        if (gameId === undefined) {
          setTimeout(() => {
            const msg =
              "Due to technical limitations, you cannot shift your perspective if you are the only person in a JSON replay.";
            modals.showWarning(msg);
          }, 0);
          return;
        }

        // We are the only person in this replay, so going back to the lobby will automatically end
        // it. So, leave the replay and create a new one (while specifying the player to view the
        // perspective from).
        setTimeout(() => {
          backToLobby();
          globals.lobby.conn!.send("replayCreate", {
            type: "id",
            gameId,
            visibility:
              globals.state.replay.shared === undefined ? "solo" : "shared",
            shadowingPlayerIndex,
          });
        }, 0);

        return;
      }

      // We are not the only person in this replay, so going back to the lobby will not
      // automatically end it. So, go back to the lobby and re-spectate the current shared replay
      // (while specifying the player to view the perspective from).
      setTimeout(() => {
        backToLobby();
        globals.lobby.conn!.send("tableSpectate", {
          tableId: globals.lobby.joinedTableId,
          shadowingPlayerIndex,
        });
      }, 0);
    }
  }
}
