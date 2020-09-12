import Suit from '../types/Suit';

const createSuitPattern = (suits: Suit[], abbreviations: string[]): string => {
  let alternation = '';
  suits.forEach((suit, i) => {
    if (i !== 0) {
      alternation += '|';
    }

    alternation += abbreviations[i].toLowerCase();
    alternation += '|';
    alternation += suit.displayName.toLowerCase();
  });

  return `(${alternation})`;
};

const createRankPattern = (ranks: number[], isUpOrDown: boolean): string => {
  let rankStrings = ranks.map((r) => r.toString());
  if (isUpOrDown) {
    rankStrings = rankStrings.concat('0', 's', 'start');
  }

  return `(${rankStrings.join('|')})`;
};

export const createIdentityNotePattern = (
  suits: Suit[],
  ranks: number[],
  abbreviations: string[],
  isUpOrDown: boolean,
): string => {
  const suitPattern = createSuitPattern(suits, abbreviations);
  const rankPattern = createRankPattern(ranks, isUpOrDown);
  return `^(?:${suitPattern} ?${rankPattern}|${rankPattern} ?${suitPattern}|${suitPattern}|${rankPattern})$`;
};

export const extractSuitText = (match: RegExpMatchArray): string | null => {
  if (match[1] !== undefined) {
    return match[1];
  }
  if (match[4] !== undefined) {
    return match[4];
  }
  if (match[5] !== undefined) {
    return match[5];
  }

  return null;
};

export const extractRankText = (match: RegExpMatchArray): string | null => {
  if (match[2] !== undefined) {
    return match[2];
  }
  if (match[3] !== undefined) {
    return match[3];
  }
  if (match[6] !== undefined) {
    return match[6];
  }

  return null;
};
