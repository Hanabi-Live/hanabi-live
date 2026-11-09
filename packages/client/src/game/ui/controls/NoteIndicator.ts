import Konva from "konva";
import type { Context } from "konva/lib/Context";

/** How far the note indicator tilts to show spectators that a note was updated. */
const TILT_DEGREES = 15;

/** The glow that shows that the note determines the suit or rank shown on the card face. */
const GLOW_COLOR = "#00e5ff";
const GLOW_BLUR = 20;

/** Canvas shadows cannot spread, so the glowing icon is drawn this many times to intensify it. */
const GLOW_PASSES = 3;

export class NoteIndicator extends Konva.Image {
  // We tilt the note indicator in order to indicate to spectators that the note was updated.
  tilted = false;

  constructor(config: Konva.ImageConfig) {
    super({
      ...config,
      shadowColor: GLOW_COLOR,
      shadowBlur: GLOW_BLUR,
      shadowEnabled: false,
    });
  }

  setTilted(tilted: boolean): void {
    if (tilted === this.tilted) {
      return;
    }

    this.rotate(tilted ? TILT_DEGREES : -TILT_DEGREES);
    this.tilted = tilted;
  }

  setGlowing(glowing: boolean): void {
    this.shadowEnabled(glowing);
  }

  override _sceneFunc(context: Context): void {
    const passes = this.shadowEnabled() ? GLOW_PASSES : 1;
    for (let i = 0; i < passes; i++) {
      super._sceneFunc(context);
    }
  }
}
