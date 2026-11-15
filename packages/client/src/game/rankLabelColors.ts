// The colors of the rank in the corner of a card, when they are not the suit's own colors. Both
// game screens use them.

import type { Rank, Suit, Variant } from "@hanabi-live/game";
import {
  DARK_OMNI_SUIT_NAME,
  OMNI_SUIT_NAME,
  getColorForRank,
  getSuit,
} from "@hanabi-live/game";

/** One color, or the colors of a gradient from top to bottom. */
export type RankLabelFill =
  { readonly fill: string } | { readonly fillColors: readonly string[] };

/**
 * Returns the colors of the rank on a card, when its variant gives the rank other colors than its
 * suit:
 *
 * - In "Synesthesia" variants, the rank has the color that it adds to the card.
 * - The special rank of a variant (such as "Rainbow-Ones") has the colors of the suit whose clues
 *   it follows, such as the colors of a rainbow.
 *
 * Returns `undefined` for a rank that has its suit's colors.
 */
export function getRankLabelFill(
  variant: Variant,
  suit: Suit,
  rank: Rank | undefined,
): RankLabelFill | undefined {
  if (variant.synesthesia) {
    // A card of unknown rank has no rank color. If the suit does not get clued by its rank, then
    // coloring the rank is misleading, so use the suit color.
    const rankColor =
      rank === undefined || suit.noClueRanks
        ? undefined
        : getColorForRank(variant, rank);
    if (rankColor !== undefined) {
      return { fill: rankColor.fill };
    }
    return suit.fillColors === undefined
      ? { fill: suit.fill }
      : { fillColors: suit.fillColors };
  }

  if (rank === undefined || rank !== variant.specialRank) {
    return undefined;
  }

  const specialSuitName = getSpecialRankSuitName(variant, suit);
  if (specialSuitName === undefined) {
    return undefined;
  }

  const specialSuit = getSuit(specialSuitName);
  return specialSuit.fillColors === undefined
    ? { fill: specialSuit.fill }
    : { fillColors: specialSuit.fillColors };
}

/** The suit whose clues the special rank of a suit follows, such as "Rainbow" or "Pink". */
function getSpecialRankSuitName(
  variant: Variant,
  suit: Suit,
): string | undefined {
  const allClueColors =
    suit.allClueColors
    || (variant.specialRankAllClueColors && !suit.noClueColors);
  const noClueColors =
    suit.noClueColors
    || (variant.specialRankNoClueColors && !suit.allClueColors);
  const allClueRanks =
    suit.allClueRanks || (variant.specialRankAllClueRanks && !suit.noClueRanks);
  const noClueRanks =
    suit.noClueRanks || (variant.specialRankNoClueRanks && !suit.allClueRanks);
  const dark = suit.oneOfEach;

  if (allClueColors) {
    if (allClueRanks) {
      return dark ? DARK_OMNI_SUIT_NAME : OMNI_SUIT_NAME;
    }
    if (noClueRanks) {
      return dark ? "Cocoa Rainbow" : "Muddy Rainbow";
    }
    return dark ? "Dark Rainbow" : "Rainbow";
  }

  if (noClueColors) {
    if (allClueRanks) {
      return dark ? "Gray Pink" : "Light Pink";
    }
    if (noClueRanks) {
      return dark ? "Dark Null" : "Null";
    }
    return dark ? "Gray" : "White";
  }

  if (allClueRanks) {
    return dark ? "Dark Pink" : "Pink";
  }

  if (noClueRanks) {
    return dark ? "Dark Brown" : "Brown";
  }

  return undefined;
}

/**
 * Returns the rank that a card of the special rank pretends to be in "Deceptive" variants, which
 * its corner shows beside its real rank. Returns `undefined` for other cards.
 */
export function getDeceptiveRank(
  variant: Variant,
  suitIndex: number,
  rank: Rank | undefined,
): Rank | undefined {
  const suit = variant.suits[suitIndex];
  const deceptive =
    variant.specialRankDeceptive
    && suit !== undefined
    && rank === variant.specialRank
    && !suit.noClueRanks;
  return deceptive
    ? variant.clueRanks[suitIndex % variant.clueRanks.length]
    : undefined;
}
