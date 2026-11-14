// How a clue shows on the New UI's clue tokens, its clue rail, and its clue log.

import type {
  Clue,
  ClueRank,
  ClueType,
  Color,
  PlayerIndex,
  StateClue,
} from "@hanabi-live/game";
import { EVEN_RANK_CLUE, getCharacterNameForPlayer } from "@hanabi-live/game";
import { currentState, currentVariant } from "../gameSession.ts";
import type { ClueMarkerView } from "./Card.tsx";

/** The fill of a color clue whose color is hidden ("Cow & Pig"), as on the classic screen. */
const HIDDEN_COLOR_FILL = "white";

/**
 * How a clue shows on a token, following the classic screen's arrows. Duck clues and the clues of a
 * Quacker (until the game ends) hide the clue. "Cow & Pig" clues show only the clue's type: a white
 * disc for a color, and "#" for a rank. These rules hold for every viewer, even when the server
 * sends spectators and replays the real clue.
 */
function getMarker(
  visibleType: ClueType | undefined,
  color: Color | undefined,
  rank: ClueRank | undefined,
  giver: PlayerIndex | undefined,
  colorblindMode: boolean,
): ClueMarkerView {
  const variant = currentVariant();
  const giverCharacterName = getCharacterNameForPlayer(
    giver,
    currentState().metadata.characterAssignments,
  );
  if (
    visibleType === undefined
    || variant.duck
    || (giverCharacterName === "Quacker" && !currentState().finished)
  ) {
    return { type: "hidden" };
  }

  if (visibleType === "color") {
    return color === undefined || variant.cowAndPig
      ? { type: "color", name: "", fill: HIDDEN_COLOR_FILL }
      : {
          type: "color",
          name: color.name,
          fill: colorblindMode ? color.fillColorblind : color.fill,
        };
  }

  if (rank === undefined || variant.cowAndPig) {
    return { type: "rank", label: "#" };
  }
  if (variant.oddsAndEvens) {
    return { type: "rank", label: rank === EVEN_RANK_CLUE ? "E" : "O" };
  }
  return { type: "rank", label: rank.toString() };
}

/** How the clue being chosen shows on the cards that it would touch. */
export function getPreviewMarker(
  clue: Clue,
  giver: PlayerIndex | undefined,
  colorblindMode: boolean,
): ClueMarkerView {
  return clue.type === "color"
    ? getMarker("color", clue.value, undefined, giver, colorblindMode)
    : getMarker("rank", undefined, clue.value, giver, colorblindMode);
}

/** How a clue shows on the arrows and beside the name of the player who gave it. */
export function getClueMarker(
  clue: StateClue,
  colorblindMode: boolean,
): ClueMarkerView {
  switch (clue.type) {
    case "color": {
      return getMarker(
        "color",
        currentVariant().clueColors[clue.color],
        undefined,
        clue.giver,
        colorblindMode,
      );
    }

    case "rank": {
      return getMarker(
        "rank",
        undefined,
        clue.rank,
        clue.giver,
        colorblindMode,
      );
    }

    case undefined: {
      return getMarker(
        clue.visibleType,
        undefined,
        undefined,
        clue.giver,
        colorblindMode,
      );
    }
  }
}
