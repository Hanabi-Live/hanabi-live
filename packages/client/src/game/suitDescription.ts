// The description of a suit that both game screens show on its play stack: its name, and the rules
// that make it special.

import type { Color, SuitIndex, Variant } from "@hanabi-live/game";
import {
  DEFAULT_CARD_RANKS,
  START_CARD_RANK,
  getColorForPrismCard,
  getSuitAbbreviationForVariant,
} from "@hanabi-live/game";

function getColorHtml(color: Color): string {
  return `<span style="color: ${color.fillColorblind}">${color.name}</span>`;
}

/** The lines that describe what makes a suit special, as HTML. A plain suit has none. */
function getSuitRuleLines(
  variant: Variant,
  suitIndex: SuitIndex,
): readonly string[] {
  const suit = variant.suits[suitIndex];
  if (suit === undefined) {
    return [];
  }
  const lines: string[] = [];

  if (suit.oneOfEach) {
    lines.push("Every card is unique.");
  }

  if (suit.clueColors.length > 1) {
    const colors = suit.clueColors.map((color) => getColorHtml(color));
    lines.push(`Touched by ${colors.join(", ")} color clues`);
  }

  if (suit.prism) {
    const ranks = variant.upOrDown
      ? [START_CARD_RANK, ...DEFAULT_CARD_RANKS]
      : DEFAULT_CARD_RANKS;
    const cards = ranks.map((rank) => {
      const rankName = rank === START_CARD_RANK ? "START" : rank.toString();
      const colorHtml = getColorHtml(getColorForPrismCard(variant, rank));
      return `${rankName} is ${colorHtml}`;
    });
    lines.push(`Colors: ${cards.join(", ")}`);
  }

  if (suit.allClueColors) {
    lines.push("Touched by every color clue.");
  }

  if (suit.noClueColors) {
    lines.push("Not touched by any color clue.");
  }

  if (suit.allClueRanks) {
    lines.push("Touched by every number clue.");
  }

  if (suit.noClueRanks) {
    lines.push("Not touched by any number clue.");
  }

  if (variant.specialRankDeceptive && !suit.noClueRanks) {
    const deceptiveRank =
      variant.clueRanks[suitIndex % variant.clueRanks.length];
    lines.push(
      `Deceptive: ${variant.specialRank} is touched by number ${deceptiveRank} clue.`,
    );
  }

  if (suit.inverted) {
    lines.push("Inverted: Plays on at attempted discard and vice-versa.");
  }

  return lines;
}

/**
 * The description of a suit, as the HTML of a tooltip: its name, its abbreviation, and its rules.
 */
export function getSuitDescriptionHtml(
  variant: Variant,
  suitIndex: SuitIndex,
): string | undefined {
  const suit = variant.suits[suitIndex];
  if (suit === undefined) {
    return undefined;
  }
  const abbreviation = getSuitAbbreviationForVariant(suit, variant);
  const lines = getSuitRuleLines(variant, suitIndex);

  return `
    <div class="small-tooltip-text">
      <div class="align-center">
        ${suit.displayName} (${abbreviation})
      </div>
      ${lines.join("<br>")}
    </div>
  `.trim();
}
