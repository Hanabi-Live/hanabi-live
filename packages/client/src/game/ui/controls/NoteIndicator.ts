import Konva from "konva";

/** How far the note indicator tilts to show spectators that a note was updated. */
const TILT_DEGREES = 15;

interface NoteIndicatorConfig extends Konva.ImageConfig {
  /** The icon shown when the note determines the suit or rank shown on the card face. */
  identitySourceImage: Konva.ImageConfig["image"];
}

export class NoteIndicator extends Konva.Image {
  // We tilt the note indicator in order to indicate to spectators that the note was updated.
  tilted = false;

  private readonly normalImage: Konva.ImageConfig["image"];
  private readonly identitySourceImage: Konva.ImageConfig["image"];

  constructor(config: NoteIndicatorConfig) {
    super(config);
    this.normalImage = config.image;
    this.identitySourceImage = config.identitySourceImage;
  }

  setTilted(tilted: boolean): void {
    if (tilted === this.tilted) {
      return;
    }

    this.rotate(tilted ? TILT_DEGREES : -TILT_DEGREES);
    this.tilted = tilted;
  }

  /** Adds a pencil to the icon when the note determines the suit or rank on the card face. */
  setIdentitySource(isIdentitySource: boolean): void {
    const image = isIdentitySource
      ? this.identitySourceImage
      : this.normalImage;
    if (image !== this.image()) {
      this.image(image);
    }
  }
}
