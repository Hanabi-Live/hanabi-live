import Suit from "../types/Suit";

function createSuitPattern(suits: Suit[], abbreviations: string[]): string {
  let alternation = "";
  suits.forEach((suit, i) => {
    if (i !== 0) {
      alternation += "|";
    }

    alternation += abbreviations[i].toLowerCase();
    alternation += "|";
    alternation += suit.displayName.toLowerCase();
  });

  return `(${alternation})`;
}

function createRankPattern(ranks: number[], isUpOrDown: boolean): string {
  let rankStrings = ranks.map((r) => r.toString());
  if (isUpOrDown) {
    rankStrings = rankStrings.concat("0", "s", "start");
  }

  return `(${rankStrings.join("|")})`;
}

export function createIdentityNotePattern(
  suits: Suit[],
  ranks: number[],
  abbreviations: string[],
  isUpOrDown: boolean,
): string {
  const suitPattern = createSuitPattern(suits, abbreviations);
  const rankPattern = createRankPattern(ranks, isUpOrDown);
  return `^(?:${suitPattern} ?${rankPattern}|${rankPattern} ?${suitPattern}|${suitPattern}|${rankPattern})$`;
}

export const extractSuitText = (match: RegExpMatchArray): string | null =>
  match[1] ?? match[4] ?? match[5] ?? null;

export const extractRankText = (match: RegExpMatchArray): string | null =>
  match[2] ?? match[3] ?? match[6] ?? null;
