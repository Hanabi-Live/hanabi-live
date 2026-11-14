/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { CardIdentity } from "./interfaces/CardIdentity.ts";
import type { CardNote } from "./interfaces/CardNote.ts";
import type { CardState } from "./interfaces/CardState.ts";
import type { Variant } from "./interfaces/Variant.ts";
import {
  isCardClued,
  isCardDiscarded,
  isCardPlayed,
} from "./rules/cardState.ts";
import type { Rank } from "./types/Rank.ts";
import type { SuitIndex } from "./types/SuitIndex.ts";
import type { SuitRankTuple } from "./types/SuitRankTuple.ts";

export enum PipState {
  Hidden = "Hidden",
  Eliminated = "Eliminated",
  Visible = "Visible",
}

interface CardIdentityPresentationOptions {
  readonly cardIdentity: CardIdentity;
  readonly state: CardState;
  readonly note: CardNote;
  readonly empathy: boolean;

  /** Whether the empathy view also applies the possibilities that the viewer's note lists. */
  readonly empathyIncludesNotes?: boolean;

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

/** One row of the possibility rows: suits that share the same possible ranks. */
export interface PossibilityRowPresentation {
  readonly suitPips: readonly SuitPipPresentation[];
  readonly rankPips: readonly RankPipPresentation[];
}

interface CardPipPresentation {
  readonly suitPips: readonly SuitPipPresentation[];
  readonly rankPips: readonly RankPipPresentation[];

  /**
   * Present when the clues leave a set of cards that the separate suit and rank pips cannot show,
   * such as "any red card, or a blue 1". Then each row lists suits with the ranks they can be.
   */
  readonly possibilityRows: readonly PossibilityRowPresentation[] | undefined;
}

export function getCardIdentityToShow({
  cardIdentity,
  state,
  note,
  empathy,
  empathyIncludesNotes = false,
  morphedIdentity,
  isStackBase,
  finished,
}: CardIdentityPresentationOptions): CardIdentity {
  let suitIndex: CardIdentity["suitIndex"];
  let rank: CardIdentity["rank"];

  if (empathy) {
    const {
      suitIndex: stateSuitIndex,
      rank: stateRank,
      suitDetermined,
      rankDetermined,
    } = state;

    if (stateSuitIndex !== undefined && suitDetermined) {
      suitIndex = stateSuitIndex;
    }
    if (stateRank !== undefined && rankDetermined) {
      rank = stateRank;
    }

    if (empathyIncludesNotes) {
      suitIndex ??= getSuitIndexFromNote(note, state);
      rank ??= getRankFromNote(note, state);
    }

    if (morphedIdentity !== undefined) {
      const { suitIndex: morphedSuitIndex, rank: morphedRank } =
        morphedIdentity;
      if (morphedSuitIndex !== undefined && morphedRank !== undefined) {
        suitIndex ??= morphedSuitIndex;
        rank ??= morphedRank;
      }
    }

    return {
      suitIndex,
      rank,
    };
  }

  const { suitIndex: cardSuitIndex, rank: cardRank } = cardIdentity;
  suitIndex = cardSuitIndex ?? getSuitIndexFromNote(note, state);

  const rankFromNote = getRankFromNote(note, state);
  rank = cardRank ?? rankFromNote;
  if (isStackBase && !finished && rankFromNote !== undefined) {
    rank = rankFromNote;
  }

  return {
    suitIndex,
    rank,
  };
}

/** Whether the note changes the suit or rank shown on the card face. */
export function isCardIdentityFromNote(
  options: CardIdentityPresentationOptions,
): boolean {
  if (options.note.possibilities.length === 0) {
    return false;
  }

  const shown = getCardIdentityToShow(options);
  const shownWithoutNote = getCardIdentityToShow({
    ...options,
    note: {
      ...options.note,
      possibilities: [],
    },
  });
  return (
    shown.suitIndex !== shownWithoutNote.suitIndex
    || shown.rank !== shownWithoutNote.rank
  );
}

export function getCardBorderPresentation(
  state: CardState,
  note: CardNote,
  finished: boolean,
): CardBorderPresentation {
  const canShowBorder = !isCardPlayed(state) && !isCardDiscarded(state);
  const clued =
    canShowBorder
    && (!note.unclued || finished)
    && (isCardClued(state) || (note.clued && !finished));
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
  {
    rowPerSuit = false,
    empathyIncludesNotes = false,
  }: {
    /** Always return one possibility row for each suit. */
    readonly rowPerSuit?: boolean;

    /** Whether the empathy view also applies the possibilities that the viewer's note lists. */
    readonly empathyIncludesNotes?: boolean;
  } = {},
): CardPipPresentation {
  const suitPipStates = variant.suits.map(() => PipState.Hidden);
  const rankPipStates = new Map<Rank, PipState>(
    variant.ranks.map((rank) => [rank, PipState.Hidden]),
  );

  const possibilities = possibleCardsFromNoteAndClues(note, state);
  const possibleCardsFromClues =
    empathy && !empathyIncludesNotes
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

  function isPositiveRank(rank: Rank) {
    return state.positiveRankClues.some(
      (positiveRank) => positiveRank === rank,
    );
  }

  const rankPips = variant.ranks.map((rank) => ({
    rank,
    state: rankPipStates.get(rank) ?? PipState.Hidden,
    positive: isPositiveRank(rank),
  }));

  const possibilityRows = getPossibilityRows(
    variant,
    possibleCardsFromClues,
    possibleCards,
    suitPips,
    isPositiveRank,
    rowPerSuit,
  );

  return {
    suitPips,
    rankPips,
    possibilityRows,
  };
}

function cardKey(suitIndex: number, rank: Rank) {
  return `${suitIndex},${rank}`;
}

/**
 * Returns undefined when the cards that the clues allow are every combination of the suits and
 * ranks they include, since the separate suit and rank pips show that set exactly. Otherwise,
 * returns one row for each group of suits that can be the same ranks. With `rowPerSuit`, always
 * returns one row for each suit.
 */
function getPossibilityRows(
  variant: Variant,
  possibleCardsFromClues: readonly SuitRankTuple[],
  possibleCards: readonly SuitRankTuple[],
  suitPips: readonly SuitPipPresentation[],
  isPositiveRank: (rank: Rank) => boolean,
  rowPerSuit: boolean,
): readonly PossibilityRowPresentation[] | undefined {
  const fromClues = new Set(
    possibleCardsFromClues.map(([suitIndex, rank]) => cardKey(suitIndex, rank)),
  );
  const possible = new Set(
    possibleCards.map(([suitIndex, rank]) => cardKey(suitIndex, rank)),
  );
  const suitCount = new Set(
    possibleCardsFromClues.map(([suitIndex]) => suitIndex),
  ).size;
  const rankCount = new Set(possibleCardsFromClues.map(([, rank]) => rank))
    .size;
  if (!rowPerSuit && fromClues.size === suitCount * rankCount) {
    return undefined;
  }

  const suits = suitPips
    .filter((suitPip) => suitPip.state !== PipState.Hidden)
    .map((suitPip) => {
      const rankPips = variant.ranks.map((rank) => {
        const key = cardKey(suitPip.suitIndex, rank);
        let pipState = PipState.Hidden;
        if (fromClues.has(key) && possible.has(key)) {
          pipState = PipState.Visible;
        } else if (fromClues.has(key)) {
          pipState = PipState.Eliminated;
        }
        return {
          rank,
          state: pipState,
          positive: isPositiveRank(rank),
        };
      });
      const clueRanksKey = rankPips
        .map((rankPip) => rankPip.state !== PipState.Hidden)
        .join(",");
      const rowKey = rankPips.map((rankPip) => rankPip.state).join(",");
      return {
        suitPip,
        rankPips,
        clueRanksKey,
        rowKey,
      };
    });

  if (rowPerSuit) {
    return suits.map(({ suitPip, rankPips }) => ({
      suitPips: [suitPip],
      rankPips,
    }));
  }

  // A ruled-out suit joins a row of suits that the clues allowed the same ranks, since its
  // crossed-out suit pip already shows that it is none of them.
  const possibleSuitForClueRanks = new Map<string, (typeof suits)[number]>();
  for (const suit of suits) {
    if (suit.suitPip.state !== PipState.Eliminated) {
      possibleSuitForClueRanks.set(suit.clueRanksKey, suit);
    }
  }

  const rows = new Map<string, PossibilityRowPresentation>();
  for (const { suitPip, rankPips, clueRanksKey, rowKey } of suits) {
    const rowSuit =
      suitPip.state === PipState.Eliminated
        ? possibleSuitForClueRanks.get(clueRanksKey)
        : undefined;
    const key = rowSuit?.rowKey ?? rowKey;
    const row = rows.get(key);
    rows.set(
      key,
      row === undefined
        ? {
            suitPips: [suitPip],
            rankPips: rowSuit?.rankPips ?? rankPips,
          }
        : {
            ...row,
            suitPips: [...row.suitPips, suitPip],
          },
    );
  }

  return [...rows.values()];
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
): SuitIndex | undefined {
  if (note.possibilities.length > 0) {
    const possibilities = possibleCardsFromNoteAndClues(note, state);
    const [candidateSuitIndex] = possibilities[0]!;
    if (
      possibilities.every(([suitIndex]) => suitIndex === candidateSuitIndex)
    ) {
      return candidateSuitIndex;
    }
  }

  return undefined;
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
