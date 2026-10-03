import * as notes from "../../notes";

/**
 * The highlighted note section in an open note tooltip depends on the turn that is currently being
 * viewed, so the tooltip must be re-rendered when the turn changes (e.g. when moving through a
 * replay).
 */
export function onTurnNumberChanged(): void {
  notes.refreshOpenTooltip();
}
