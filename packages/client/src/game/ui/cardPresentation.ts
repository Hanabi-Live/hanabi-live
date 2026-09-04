import type {
  CardIdentity,
  CardNote,
  CardState,
  Rank,
  SuitIndex,
  SuitRankTuple,
  Variant,
} from "@hanabi-live/game";
import { isCardClued, isCardDiscarded, isCardPlayed } from "@hanabi-live/game";

export enum PipState {
  Hidden,
  Eliminated,
  Visible,
}

interface CardIdentityPresentationOptions {
  readonly cardIdentity: CardIdentity;
  readonly state: CardState;
  readonly note: CardNote;
  readonly empathy: boolean;
  readonly morphedIdentity?: CardIdentity;
  readonly isStackBase: boolean;
  readonly finished: boolean;
}

interface CardBorderPresentation {
  readonly clued: boolean;
  readonly chopMoved: boolean;
  readonly finessed: boolean;
  readonly discardPermission: boolean;
}

interface SuitPipPresentation {
  readonly suitIndex: number;
  readonly state: PipState;
  readonly positive: boolean;
}

interface RankPipPresentation {
  readonly rank: Rank;
  readonly state: PipState;
  readonly positive: boolean;
}

interface CardPipPresentation {
  readonly suitPips: readonly SuitPipPresentation[];
  readonly rankPips: readonly RankPipPresentation[];
}

export function getCardIdentityToShow({
  cardIdentity,
  state,
  note,
  empathy,
  morphedIdentity,
  isStackBase,
  finished,
}: CardIdentityPresentationOptions): CardIdentity {
  let suitIndex: CardIdentity["suitIndex"] = null;
  let rank: CardIdentity["rank"] = null;

  if (empathy) {
    const {
      suitIndex: stateSuitIndex,
      rank: stateRank,
      suitDetermined,
      rankDetermined,
    } = state;

    if (stateSuitIndex !== null && suitDetermined) {
      suitIndex = stateSuitIndex;
    }
    if (stateRank !== null && rankDetermined) {
      rank = stateRank;
    }

    if (morphedIdentity !== undefined) {
      const { suitIndex: morphedSuitIndex, rank: morphedRank } =
        morphedIdentity;
      if (morphedSuitIndex !== null && morphedRank !== null) {
        suitIndex ??= morphedSuitIndex;
        rank ??= morphedRank;
      }
    }

    return { suitIndex, rank };
  }

  const { suitIndex: cardSuitIndex, rank: cardRank } = cardIdentity;
  suitIndex = cardSuitIndex ?? getSuitIndexFromNote(note, state);

  const rankFromNote = getRankFromNote(note, state);
  rank = cardRank ?? rankFromNote ?? null;
  if (isStackBase && !finished && rankFromNote !== undefined) {
    rank = rankFromNote;
  }

  return { suitIndex, rank };
}

export function getCardBorderPresentation(
  state: CardState,
  note: CardNote,
  finished: boolean,
): CardBorderPresentation {
  const canShowBorder = !isCardPlayed(state) && !isCardDiscarded(state);
  const unclued = note.unclued && !finished;
  const clued =
    canShowBorder && !unclued && (isCardClued(state) || note.clued);
  const finessed = note.finessed && canShowBorder && !clued && !finished;
  const discardPermission =
    note.discardPermission && canShowBorder && !clued && !finessed && !finished;
  const chopMoved =
    note.chopMoved
    && canShowBorder
    && !clued
    && !finessed
    && !discardPermission
    && !finished;

  return {
    clued,
    chopMoved,
    finessed,
    discardPermission,
  };
}

export function getCardPipPresentation(
  variant: Variant,
  state: CardState,
  note: CardNote,
  empathy: boolean,
): CardPipPresentation {
  const suitPipStates = variant.suits.map(() => PipState.Hidden);
  const rankPipStates = new Map<Rank, PipState>(
    variant.ranks.map((rank) => [rank, PipState.Hidden]),
  );

  const possibilities = possibleCardsFromNoteAndClues(note, state);
  const possibleCardsFromClues = empathy
    ? state.possibleCardsFromClues
    : possibilities;
  const possibleCards = empathy
    ? state.possibleCardsForEmpathy
    : state.possibleCards;

  for (const [suitIndex, rank] of possibleCardsFromClues) {
    const pipState = possibleCards.some(
      ([possibleSuitIndex, possibleRank]) =>
        possibleSuitIndex === suitIndex && possibleRank === rank,
    )
      ? PipState.Visible
      : PipState.Eliminated;

    suitPipStates[suitIndex] =
      suitPipStates[suitIndex] === PipState.Visible
        ? PipState.Visible
        : pipState;

    const existingRankState = rankPipStates.get(rank);
    if (existingRankState !== undefined) {
      rankPipStates.set(
        rank,
        existingRankState === PipState.Visible ? PipState.Visible : pipState,
      );
    }
  }

  const suitPips = variant.suits.map((suit, suitIndex) => ({
    suitIndex,
    state: suitPipStates[suitIndex] ?? PipState.Hidden,
    positive: state.positiveColorClues.some(
      (color) => color.name === suit.name,
    ),
  }));

  const rankPips = variant.ranks.map((rank) => ({
    rank,
    state: rankPipStates.get(rank) ?? PipState.Hidden,
    // eslint-disable-next-line unicorn/prefer-includes
    positive: state.positiveRankClues.some(
      (positiveRank) => positiveRank === rank,
    ),
  }));

  return { suitPips, rankPips };
}

export function possibleCardsFromNoteAndClues(
  note: CardNote,
  state: CardState,
): readonly SuitRankTuple[] {
  const possibilitiesWithNotes = note.possibilities.filter(
    ([suitIndexA, rankA]) =>
      state.possibleCardsFromClues.some(
        ([suitIndexB, rankB]) => suitIndexA === suitIndexB && rankA === rankB,
      ),
  );

  if (possibilitiesWithNotes.length === 0) {
    return state.possibleCardsFromClues;
  }

  return possibilitiesWithNotes;
}

function getSuitIndexFromNote(
  note: CardNote,
  state: CardState,
): SuitIndex | null {
  if (note.possibilities.length > 0) {
    const possibilities = possibleCardsFromNoteAndClues(note, state);
    const [candidateSuitIndex] = possibilities[0]!;
    if (
      possibilities.every(([suitIndex]) => suitIndex === candidateSuitIndex)
    ) {
      return candidateSuitIndex;
    }
  }

  return null;
}

function getRankFromNote(note: CardNote, state: CardState): Rank | undefined {
  const possibilities = possibleCardsFromNoteAndClues(note, state);
  const possibleRanks = possibilities.map((possibility) => possibility[1]);
  const firstPossibleRank = possibleRanks[0];
  if (firstPossibleRank === undefined) {
    return undefined;
  }

  const allPossibilitiesHaveTheSameRank = possibleRanks.every(
    (rank) => rank === firstPossibleRank,
  );
  return allPossibilitiesHaveTheSameRank ? firstPossibleRank : undefined;
}
