import type { PlayerIndex } from "@hanabi/data";
import Konva from "konva";
import { Button } from "./Button";

export class PlayerButton extends Button {
  targetPlayerIndex: PlayerIndex;
  radioBackground: Konva.Circle;
  radioDot: Konva.Circle;

  constructor(config: Konva.ContainerConfig, targetPlayerIndex: PlayerIndex) {
    super(config, []);
    this.targetPlayerIndex = targetPlayerIndex;

    const x = this.height() / 2;
    this.radioBackground = new Konva.Circle({
      x,
      y: x,
      radius: x / 1.5,
      stroke: "gray",
      fill: "white",
      opacity: 0.8,
    });
    this.add(this.radioBackground);

    this.radioDot = new Konva.Circle({
      x,
      y: x,
      radius: x / 3,
      fill: "black",
      opacity: 0.8,
      visible: false,
    });
    this.add(this.radioDot);
  }

  override setPressed(pressed: boolean): void {
    this.radioDot.visible(pressed);
    super.setPressed(pressed);
  }
}
