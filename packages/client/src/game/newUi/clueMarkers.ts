// How a clue shows on the New UI's clue tokens, its clue rail, and its clue log.

import type {
  CardOrder,
  Clue,
  ClueRank,
  ClueType,
  Color,
  PlayerIndex,
  StateClue,
} from "@hanabi-live/game";
import { EVEN_RANK_CLUE, getCharacterNameForPlayer } from "@hanabi-live/game";
import { currentState, currentVariant } from "../gameSession.ts";
import type { CardClueMarker, ClueMarkerView } from "./Card.tsx";

/** The animal that stands for a clue that the variant hides, after the clue's sound. */
export const QUACK_EMOJI = "\u{1F986}";
export const MOO_EMOJI = "\u{1F42E}";
export const OINK_EMOJI = "\u{1F437}";

/** A ring of every clue color of the variant, which stands for "some color". */
function getAnyColorFill(
  colors: readonly Color[],
  colorblindMode: boolean,
): string {
  const fills = colors.map((color) =>
    colorblindMode ? color.fillColorblind : color.fill,
  );
  return `conic-gradient(${[...fills, fills[0]].join(", ")})`;
}

/**
 * How a clue shows on a token. Duck clues and the clues of a Quacker (until the game ends) hide the
 * clue, so they show a duck. "Cow & Pig" clues show only the clue's type: a cow with a badge of
 * every color for a color, and a pig with a "#" badge for a rank. These rules hold for every
 * viewer, even when the server sends spectators and replays the real clue.
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
    return {
      type: "sound",
      emoji: QUACK_EMOJI,
    };
  }

  if (visibleType === "color") {
    return color === undefined || variant.cowAndPig
      ? {
          type: "sound",
          emoji: MOO_EMOJI,
          badge: {
            type: "fill",
            fill: getAnyColorFill(variant.clueColors, colorblindMode),
          },
        }
      : {
          type: "color",
          name: color.name,
          fill: colorblindMode ? color.fillColorblind : color.fill,
        };
  }

  if (rank === undefined || variant.cowAndPig) {
    return {
      type: "sound",
      emoji: OINK_EMOJI,
      badge: {
        type: "mark",
        mark: "#",
      },
    };
  }
  if (variant.oddsAndEvens) {
    return {
      type: "rank",
      label: rank === EVEN_RANK_CLUE ? "E" : "O",
    };
  }
  return {
    type: "rank",
    label: rank.toString(),
  };
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

/** The cards that the clues before a segment touched. With no segment, every clue's cards. */
export function getCardsTouchedBefore(
  clues: readonly StateClue[],
  segment?: number,
): ReadonlySet<CardOrder> {
  return new Set(
    clues
      .filter((clue) => segment === undefined || clue.segment < segment)
      .flatMap((clue) => clue.list),
  );
}

/**
 * The markers for the cards that a clue touched. A card that an earlier clue touched too gets a dot
 * without a point, so that the cards that the clue touches for the first time stand out. A card in
 * `chopMoved` that the clue touches for the first time gets a gray ring (see `CardClueMarker`).
 */
export function getClueMarkers(
  clue: StateClue | undefined,
  clues: readonly StateClue[],
  colorblindMode: boolean,
  chopMoved: ReadonlySet<CardOrder> = new Set(),
): ReadonlyMap<CardOrder, CardClueMarker> {
  const markers = new Map<CardOrder, CardClueMarker>();
  if (clue === undefined) {
    return markers;
  }

  const marker = getClueMarker(clue, colorblindMode);
  const touchedBefore = getCardsTouchedBefore(clues, clue.segment);
  for (const order of clue.list) {
    markers.set(order, {
      marker,
      touchedBefore: touchedBefore.has(order),
      chopMoved: chopMoved.has(order),
    });
  }
  return markers;
}
