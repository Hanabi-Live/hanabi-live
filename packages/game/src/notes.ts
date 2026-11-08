import { assertDefined } from "complete-common";
import type { Suit } from "./interfaces/Suit";

/**
 * The names of the groups in an identity note pattern that capture a suit, one for each alternative
 * that has a suit. They are lowercase because callers may lowercase the whole pattern.
 */
export const SUIT_GROUP_NAMES = ["suit1", "suit2", "suit3"] as const;

/** The names of the groups in an identity note pattern that capture a rank. */
export const RANK_GROUP_NAMES = ["rank1", "rank2", "rank3"] as const;

/**
 * The name of the group in an identity note pattern that captures squished letters (e.g. `r1b`).
 */
export const SQUISH_GROUP_NAME = "squish";

/**
 * This function generates a regular expression that is used to detect "identity notes" (i.e., notes
 * about the possible identities of a card, such as `this is a [red 1]`).
 */
export function getIdentityNotePatternForVariant(
  suits: readonly Suit[],
  ranks: readonly number[],
  suitAbbreviations: readonly string[],
  isUpOrDown: boolean,
): string {
  const suitAlternation = createSuitAlternation(suits, suitAbbreviations);
  const rankAlternation = createRankAlternation(ranks, isUpOrDown);
  const squishPattern = createSquishPattern(
    suitAbbreviations,
    ranks,
    isUpOrDown,
  );

  // A regular expression cannot reuse a group name, so each alternative gets its own groups.
  const [suitThenRankSuit, rankThenSuitSuit, suitOnly] = SUIT_GROUP_NAMES;
  const [suitThenRankRank, rankThenSuitRank, rankOnly] = RANK_GROUP_NAMES;
  const suitThenRank = `(?<${suitThenRankSuit}>${suitAlternation}) ?(?<${suitThenRankRank}>${rankAlternation})`;
  const rankThenSuit = `(?<${rankThenSuitRank}>${rankAlternation}) ?(?<${rankThenSuitSuit}>${suitAlternation})`;
  const squish = `(?<${SQUISH_GROUP_NAME}>${squishPattern})`;

  return `^(?:${suitThenRank}|${rankThenSuit}|(?<${suitOnly}>${suitAlternation})|(?<${rankOnly}>${rankAlternation})|${squish})$`;
}

function createSuitAlternation(
  suits: readonly Suit[],
  suitAbbreviations: readonly string[],
): string {
  if (suits.length !== suitAbbreviations.length) {
    throw new Error(
      "The amount of suits were not the same as the amount of suit abbreviations.",
    );
  }

  let alternation = "";

  for (const [suitIndex, suit] of suits.entries()) {
    if (suitIndex !== 0) {
      alternation += "|";
    }

    const suitAbbreviation = suitAbbreviations[suitIndex];
    assertDefined(
      suitAbbreviation,
      `Failed to find the suit abbreviation for index: ${suitIndex}`,
    );

    alternation += suitAbbreviation.toLowerCase();
    alternation += "|";
    alternation += suit.displayName.toLowerCase();
  }

  return alternation;
}

function createRankAlternation(
  ranks: readonly number[],
  isUpOrDown: boolean,
): string {
  let rankStrings = ranks.map((r) => r.toString());
  if (isUpOrDown) {
    rankStrings = [...rankStrings, "0", "s", "start"];
  }

  return rankStrings.join("|");
}

function createSquishPattern(
  suitAbbreviations: readonly string[],
  ranks: readonly number[],
  isUpOrDown: boolean,
): string {
  let rankStrings = ranks.map((r) => r.toString());
  if (isUpOrDown) {
    rankStrings = [...rankStrings, "0", "s"];
  }

  const allNoteLetters = [...rankStrings, ...suitAbbreviations];
  return `[${allNoteLetters.join("").toLowerCase()}]+`;
}
