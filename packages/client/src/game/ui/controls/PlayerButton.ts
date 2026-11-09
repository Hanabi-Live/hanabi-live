import type { PlayerIndex } from "@hanabi-live/game";
import Konva from "konva";
import { Button } from "./Button";

/** The opacity of the radio button that shows which player is selected. */
const RADIO_OPACITY = 0.8;

/**
 * The radius of the radio button, as a fraction of the button's height. It is centered in a square
 * at the left end of the button.
 */
const RADIO_RADIUS = 1 / 3;

/** The radius of the dot inside a selected radio button, as a fraction of the button's height. */
const RADIO_DOT_RADIUS = RADIO_RADIUS / 2;

export class PlayerButton extends Button {
  targetPlayerIndex: PlayerIndex;
  radioBackground: Konva.Circle;
  radioDot: Konva.Circle;

  constructor(config: Konva.ContainerConfig, targetPlayerIndex: PlayerIndex) {
    super(config, []);
    this.targetPlayerIndex = targetPlayerIndex;

    const h = this.height();
    const x = h / 2;
    this.radioBackground = new Konva.Circle({
      x,
      y: x,
      radius: RADIO_RADIUS * h,
      stroke: "gray",
      fill: "white",
      opacity: RADIO_OPACITY,
    });
    this.add(this.radioBackground);

    this.radioDot = new Konva.Circle({
      x,
      y: x,
      radius: RADIO_DOT_RADIUS * h,
      fill: "black",
      opacity: RADIO_OPACITY,
      visible: false,
    });
    this.add(this.radioDot);
  }

  override setPressed(pressed: boolean): void {
    this.radioDot.visible(pressed);
    super.setPressed(pressed);
  }
}
