import Konva from "konva";
import * as modals from "../../modals";
import * as tooltips from "../../tooltips";
import { globals } from "./UIGlobals";
import { backToLobby } from "./backToLobby";
import { LABEL_COLOR } from "./constants";
import * as konvaTooltips from "./konvaTooltips";

export class NameFrame extends Konva.Group {
  playerIndex: number;
  tooltipName: string;

  playerName: Konva.Text;
  leftLine: Konva.Line;
  rightLine: Konva.Line;

  defaultStrokeWidth: number;

  constructor(config: Konva.ContainerConfig) {
    super(config);
    this.listening(true); // Needed for the hover events

    if (config.width === undefined) {
      throw new Error("A NameFrame was initialized without a width.");
    }
    if (config.height === undefined) {
      throw new Error("A NameFrame was initialized without a height.");
    }

    // Class variables
    this.playerIndex = config["playerIndex"] as number;
    this.tooltipName = `player-${this.playerIndex}`;

    this.playerName = new Konva.Text({
      x: config.width / 2,
      y: 0,
      height: config.height,
      align: "center",
      fontFamily: "Verdana",
      fontSize: config.height,
      text: config.name,
      fill: LABEL_COLOR,
      shadowColor: "black",
      shadowBlur: 5,
      shadowOffset: {
        x: 0,
        y: 3,
      },
      shadowOpacity: 0.9,
      listening: true, // Needed so that we can click on a player's name to shadow them
    });

    let w = this.playerName.width();
    while (w > 0.65 * config.width && this.playerName.fontSize() > 5) {
      this.playerName.fontSize(this.playerName.fontSize() * 0.9);
      w = this.playerName.width();
    }
    this.playerName.offsetX(w / 2);
    this.playerName.on(
      "click tap",
      (event: Konva.KonvaEventObject<MouseEvent>) => {
        // "event.evt.buttons" is always 0 here.
        if (event.evt.button === 0) {
          // Left-click
          this.leftClick();
        } else if (event.evt.button === 2) {
          // Right-click
          this.rightClick();
        }
      },
    );
    this.add(this.playerName);

    w *= 1.4;

    this.defaultStrokeWidth = 0.001_056 * globals.stage.height();

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
      shadowColor: "black",
      shadowBlur: 5,
      shadowOffset: {
        x: 0,
        y: 3,
      },
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
      shadowColor: "black",
      shadowBlur: 5,
      shadowOffset: {
        x: 0,
        y: 3,
      },
      shadowOpacity: 0,
      listening: false,
    });
    this.add(this.rightLine);

    // Draw the tooltips on the player names that show the time. (We do not use the "tooltip.init()"
    // function because we need the extra condition in the "mouseover" and "mouseout" event.)
    this.on("mouseover touchstart", function mouseOver(this: NameFrame) {
      konvaTooltips.resetActiveHover();
      globals.activeHover = this;

      // Do not do anything if we are in a solo/shared replay.
      if (globals.state.finished) {
        return;
      }

      konvaTooltips.show(this);
    });
    this.on("mouseout touchend", () => {
      globals.activeHover = null;

      // Do not do anything if we are in a solo/shared replay.
      if (globals.state.finished) {
        return;
      }
      tooltips.close(`#tooltip-${this.tooltipName}`);
    });
  }

  setActive(active: boolean): void {
    const strokeWidth = active
      ? 3 * this.defaultStrokeWidth
      : this.defaultStrokeWidth;
    this.leftLine.strokeWidth(strokeWidth);
    this.rightLine.strokeWidth(strokeWidth);

    this.playerName.shadowOpacity(active ? 0.6 : 0);
    this.leftLine.shadowOpacity(active ? 0.6 : 0);
    this.rightLine.shadowOpacity(active ? 0.6 : 0);

    this.playerName.fontStyle(active ? "bold" : "normal");
  }

  setConnected(connected: boolean): void {
    const color = connected ? LABEL_COLOR : "#e8233d"; // Red for disconnected players.

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
    const shadowingPlayerIndex = globals.metadata.playerNames.indexOf(
      this.playerName.text(),
    );
    if (shadowingPlayerIndex === -1) {
      throw new Error(
        `Failed to find the index corresponding to player "${this.playerName.text()}".`,
      );
    }

    if (!globals.state.playing && !globals.state.finished) {
      // As a spectator in an ongoing game, right-clicking on a name frame reloads the page,
      // shifting the seat and hiding the appropriate cards (so that you can spectate from a
      // specific player's perspective).

      // Validate that we are not shifting to the perspective that we are already at.
      let oldShadowingPlayerIndex: number | null = null;
      for (const spectator of globals.state.spectators) {
        if (spectator.name === globals.metadata.ourUsername) {
          if (spectator.shadowingPlayerIndex !== -1) {
            oldShadowingPlayerIndex = spectator.shadowingPlayerIndex;
          }
          break;
        }
      }
      if (shadowingPlayerIndex === oldShadowingPlayerIndex) {
        modals.showWarning(
          "You are already viewing the game from this player's perspective.",
        );
        return;
      }

      setTimeout(() => {
        backToLobby();
        globals.lobby.conn!.send("tableSpectate", {
          tableID: globals.lobby.tableID,
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
        if (globals.state.replay.databaseID === null) {
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
            source: "id",
            databaseID: globals.state.replay.databaseID,
            visibility:
              globals.state.replay.shared === null ? "solo" : "shared",
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
          tableID: globals.lobby.tableID,
          shadowingPlayerIndex,
        });
      }, 0);
    }
  }
}
