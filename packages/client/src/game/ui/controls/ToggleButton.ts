import type Konva from "konva";
import { BUTTON_DISABLED_TEXT_COLOR } from "../constants";
import { drawLayer } from "../konvaHelpers";
import { Button } from "./Button";

/** The border shown while the button is on, matching the border of the score area. */
const ON_BORDER_COLOR = "lime";

/** The width of the border shown while the button is on, as a fraction of its height. */
const ON_BORDER_WIDTH = 0.05;

/** The color of the struck-through text shown while the button is off. */
const OFF_TEXT_COLOR = "#8a8a8a";

/** The opacity of the image shown while the button is off or disabled. */
const OFF_IMAGE_OPACITY = 0.35;

/**
 * A button that turns a setting on or off. A border shows that it is on, and struck-through text or
 * a faded image shows that it is off.
 */
export class ToggleButton extends Button {
  constructor(
    config: Konva.ContainerConfig,
    images?: readonly HTMLImageElement[],
  ) {
    super(config, images);
    this.background.stroke(ON_BORDER_COLOR);
    this.background.strokeWidth(ON_BORDER_WIDTH * this.height());
    this.setPressed(false);
  }

  override setEnabled(enabled: boolean): void {
    super.setEnabled(enabled);
    this.updateStyle();
  }

  override setPressed(pressed: boolean): void {
    this.pressed = pressed;
    this.updateStyle();
  }

  private updateStyle(): void {
    this.background.strokeEnabled(this.pressed);
    let textColor = this.pressed ? "white" : OFF_TEXT_COLOR;
    if (!this.enabled) {
      textColor = BUTTON_DISABLED_TEXT_COLOR;
    }
    this.textElement?.fill(textColor);
    this.textElement?.textDecoration(this.pressed ? "" : "line-through");
    this.imageElement?.opacity(
      this.pressed && this.enabled ? 1 : OFF_IMAGE_OPACITY,
    );
    drawLayer(this);
  }
}
