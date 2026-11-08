import Konva from "konva";

/** How far the note indicator tilts to show spectators that a note was updated. */
const TILT_DEGREES = 15;

export class NoteIndicator extends Konva.Image {
  // We tilt the note indicator in order to indicate to spectators that the note was updated.
  tilted = false;

  setTilted(tilted: boolean): void {
    if (tilted === this.tilted) {
      return;
    }

    this.rotate(tilted ? TILT_DEGREES : -TILT_DEGREES);
    this.tilted = tilted;
  }
}
