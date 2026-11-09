import type Konva from "konva";
import { drawLayer } from "../konvaHelpers";
import { Button } from "./Button";

/** The border shown while we are ready, matching the border of the score area. */
const READY_BORDER_COLOR = "lime";

/** The width of the border shown while we are ready, as a fraction of the button's height. */
const READY_BORDER_WIDTH = 0.05;

/** The color of the struck-through text shown while we are not ready. */
const NOT_READY_TEXT_COLOR = "#8a8a8a";

/**
 * The button for players in a shared replay to tell the leader whether they will play again. A
 * border shows that we are ready, and struck-through text shows that we are not.
 */
export class ReadyButton extends Button {
  constructor(config: Konva.ContainerConfig) {
    super({ ...config, text: "Ready" });
    this.background.stroke(READY_BORDER_COLOR);
    this.background.strokeWidth(READY_BORDER_WIDTH * this.height());
    this.setReady(true);
  }

  setReady(ready: boolean): void {
    this.pressed = ready;
    this.background.strokeEnabled(ready);
    this.textElement?.fill(ready ? "white" : NOT_READY_TEXT_COLOR);
    this.textElement?.textDecoration(ready ? "" : "line-through");
    drawLayer(this);
  }
}
