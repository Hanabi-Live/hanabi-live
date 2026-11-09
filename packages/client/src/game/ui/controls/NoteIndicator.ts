import Konva from "konva";

/** How far the note indicator tilts to show spectators that a note was updated. */
const TILT_DEGREES = 15;

/**
 * The note icon is tinted blue when the note determines the suit or rank shown on the card face.
 * The icon is yellow, so this hue rotation turns it blue.
 */
const IDENTITY_SOURCE_FILTER = "hue-rotate(170deg) saturate(4)";

/** The blue copy of each note icon, which is made once for each source image. */
const identitySourceImages = new WeakMap<
  CanvasImageSource,
  HTMLCanvasElement
>();

function getIdentitySourceImage(image: HTMLImageElement): HTMLCanvasElement {
  const existing = identitySourceImages.get(image);
  if (existing !== undefined) {
    return existing;
  }

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.filter = IDENTITY_SOURCE_FILTER;
    ctx.drawImage(image, 0, 0);
  }
  identitySourceImages.set(image, canvas);

  return canvas;
}

export class NoteIndicator extends Konva.Image {
  // We tilt the note indicator in order to indicate to spectators that the note was updated.
  tilted = false;

  private readonly normalImage: Konva.ImageConfig["image"];

  constructor(config: Konva.ImageConfig) {
    super(config);
    this.normalImage = config.image;
  }

  setTilted(tilted: boolean): void {
    if (tilted === this.tilted) {
      return;
    }

    this.rotate(tilted ? TILT_DEGREES : -TILT_DEGREES);
    this.tilted = tilted;
  }

  /** Tints the icon blue when the note determines the suit or rank shown on the card face. */
  setIdentitySource(isIdentitySource: boolean): void {
    const image =
      isIdentitySource && this.normalImage instanceof HTMLImageElement
        ? getIdentitySourceImage(this.normalImage)
        : this.normalImage;
    if (image !== this.image()) {
      this.image(image);
    }
  }
}
