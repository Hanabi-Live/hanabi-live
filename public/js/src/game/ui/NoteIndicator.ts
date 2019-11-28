// Imports
import Konva from 'konva';

export default class NoteIndicator extends Konva.Image {
    // We rotate the note indicator in order to indicate to spectators that the note was updated
    rotated: boolean = false;
}
