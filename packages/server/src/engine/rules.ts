import type { Clue, Variant } from "@hanabi-live/game";
import {
  getVariant,
  isCardTouchedByClue,
  newColorClue,
  newRankClue,
  rankClueNumber,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import type {
  EnginePlayer,
  EngineState,
  MutableCard,
  MutableEngineState,
  MutablePlayer,
  PlayerAction,
} from "./types";

export function at<T>(values: readonly T[], index: number): T {
  const value = values[index];
  assertDefined(value, `Missing engine index: ${index}`);
  return value;
}

export function variantFor(state: EngineState): Variant {
  return getVariant(state.options.variantName);
}

export function clueCost(state: EngineState): number {
  return variantFor(state).clueStarved ? 2 : 1;
}

export function hasReversedSuits(variant: Variant): boolean {
  return variant.upOrDown || variant.suits.some((suit) => suit.reversed);
}

export function touchedOrders(
  state: EngineState,
  action: PlayerAction,
): readonly number[] {
  const variant = variantFor(state);
  let clue: Clue;
  if (action.type === 2) {
    clue = newColorClue(at(variant.clueColors, action.value));
  } else {
    clue = newRankClue(rankClueNumber.parse(action.value));
  }
  return at(state.players, action.target).hand.filter((order) => {
    const card = at(state.deck, order);
    return isCardTouchedByClue(variant, clue, card.suitIndex, card.rank);
  });
}

export function seesCard(
  state: EngineState,
  viewer: EnginePlayer,
  holder: EnginePlayer,
  order: number,
): boolean {
  if (!state.options.detrimentalCharacters) {
    return true;
  }
  const count = state.players.length;
  if (
    viewer.character === "Blind Spot"
    && holder.index === (viewer.index + 1) % count
  ) {
    return false;
  }
  if (
    viewer.character === "Oblivious"
    && holder.index === (viewer.index + count - 1) % count
  ) {
    return false;
  }
  return viewer.character !== "Slow-Witted" || holder.hand.at(-1) !== order;
}

export function drawCard(
  draft: MutableEngineState,
  player: MutablePlayer,
): void {
  const state = draft;
  if (state.deckIndex >= state.deck.length) {
    return;
  }
  const card = at(state.deck, state.deckIndex);
  state.deckIndex++;
  player.hand.push(card.order);
  state.events.push({
    type: "draw",
    playerIndex: player.index,
    order: card.order,
    suitIndex: card.suitIndex,
    rank: card.rank,
  });
  if (
    state.options.detrimentalCharacters
    && player.hand.length > 1
    && state.players.some((other) => other.character === "Slow-Witted")
  ) {
    const previous = at(state.deck, at(player.hand, player.hand.length - 2));
    state.events.push({
      type: "cardIdentity",
      playerIndex: player.index,
      order: previous.order,
      suitIndex: previous.suitIndex,
      rank: previous.rank,
    });
  }
  if (state.deckIndex === state.deck.length && !state.options.allOrNothing) {
    state.endTurn = state.turn + state.players.length + 1;
    if (
      state.options.detrimentalCharacters
      && state.players.some((other) => other.character === "Contrarian")
    ) {
      state.endTurn = state.turn + 3;
    }
  }
}

export function removeCard(
  state: MutableEngineState,
  player: MutablePlayer,
  order: number,
): MutableCard {
  const index = player.hand.indexOf(order);
  if (index === -1) {
    throw new Error("Validated card is absent from the hand.");
  }
  const card = at(state.deck, order);
  card.slot = player.hand.length - index;
  player.hand.splice(index, 1);
  if (state.options.detrimentalCharacters && card.insistentTouched) {
    for (const remaining of player.hand) {
      at(state.deck, remaining).insistentTouched = false;
    }
    const insistent = state.players.find(
      (other) => other.character === "Insistent",
    );
    if (insistent !== undefined) {
      insistent.characterMetadata = -1;
    }
  }
  return card;
}

function neededRanks(state: EngineState, suit: number): readonly number[] {
  const variant = variantFor(state);
  const stack = at(state.stacks, suit);
  const direction = at(state.playStackDirections, suit);
  if (hasReversedSuits(variant)) {
    switch (direction) {
      case 0: {
        return stack === 0 ? [1, 5, 7] : [2, 4];
      }

      case 1: {
        return [stack + 1];
      }

      case 2: {
        return [!variant.upOrDown && stack === 0 ? 5 : stack - 1];
      }

      default: {
        return [];
      }
    }
  }
  if (variant.sudoku) {
    if (direction === 3) {
      return [];
    }
    return stack === 0
      ? variant.ranks.filter((rank) => !state.stackStarts.includes(rank))
      : [(stack % variant.stackSize) + 1];
  }
  return stack === 5 ? [] : [stack + 1];
}

/** Go updates stack direction/start before applying Follower's forced misplay. */
export function tryPlay(draft: MutableEngineState, card: MutableCard): boolean {
  const state = draft;
  const variant = variantFor(state);
  const suit = card.suitIndex;
  const stack = at(state.stacks, suit);
  const direction = at(state.playStackDirections, suit);
  if (variant.sudoku) {
    if (stack === 0) {
      if (state.stackStarts.includes(card.rank)) {
        return false;
      }
      state.stackStarts[suit] = card.rank;
    } else {
      if (direction === 3 || card.rank !== (stack % variant.stackSize) + 1) {
        return false;
      }
      const finalRank =
        ((at(state.stackStarts, suit) + variant.stackSize - 2)
          % variant.stackSize)
        + 1;
      if (card.rank === finalRank) {
        state.playStackDirections[suit] = 3;
      }
    }
    return true;
  }
  if (!neededRanks(state, suit).includes(card.rank)) {
    return false;
  }
  if (hasReversedSuits(variant)) {
    if (direction === 0) {
      if (card.rank === 1 || card.rank === 2) {
        state.playStackDirections[suit] = 1;
      } else if (card.rank === 4 || card.rank === 5) {
        state.playStackDirections[suit] = 2;
      }
    } else if (
      (direction === 1 && card.rank === 5)
      || (direction === 2 && card.rank === 1)
    ) {
      state.playStackDirections[suit] = 3;
    }
  }
  return true;
}

export function followerMisplays(
  state: EngineState,
  player: EnginePlayer,
  card: Readonly<MutableCard>,
): boolean {
  if (!state.options.detrimentalCharacters || player.character !== "Follower") {
    return false;
  }
  const variant = variantFor(state);
  const size = variant.ranks.length;
  let played = 0;
  for (const [suit, stack] of state.stacks.entries()) {
    if (variant.sudoku) {
      if (
        stack !== 0
        && (stack - at(state.stackStarts, suit) + size) % size
          >= (card.rank - at(state.stackStarts, suit) + size) % size
      ) {
        played++;
      }
    } else if (stack >= card.rank) {
      played++;
    }
  }
  return played < 2;
}

function availableRanks(state: EngineState, suit: number): ReadonlySet<number> {
  return new Set(
    state.deck
      .filter((card) => card.suitIndex === suit && !card.discarded)
      .map((card) => card.rank),
  );
}

function reversibleWalk(
  available: ReadonlySet<number>,
  upOrDown: boolean,
  down: boolean,
): number {
  const first = down ? 5 : 1;
  if (!available.has(first) && !(upOrDown && available.has(7))) {
    return 0;
  }
  let score = 1;
  for (let rank = down ? 4 : 2; rank >= 1 && rank <= 5; rank += down ? -1 : 1) {
    if (!available.has(rank)) {
      break;
    }
    score++;
  }
  return score;
}

function sudokuScores(
  available: ReadonlySet<number>,
  size: number,
): readonly number[] {
  const scores = Array.from({ length: 5 }, () => size);
  let lastDead = -1;
  for (let rank = 0; rank < size; rank++) {
    if (!available.has(rank + 1)) {
      for (let write = lastDead + 1; write < rank; write++) {
        // A stack that is started at this rank cannot play the cards that come before it, so its
        // sequence ends at the discarded rank.
        scores[write] = rank - write;
      }
      scores[rank] = 0;
      lastDead = rank;
    }
  }
  if (lastDead !== -1) {
    for (let write = lastDead + 1; write < size; write++) {
      scores[write] = Math.min(at(scores, 0) + size - write, size);
    }
  }
  return scores;
}

function sudokuMaxScore(state: EngineState, variant: Variant): number {
  let independent = 0;
  const unassigned: Array<readonly number[]> = [];
  for (const [suit, start] of state.stackStarts.entries()) {
    const scores = sudokuScores(availableRanks(state, suit), variant.stackSize);
    if (scores.every((score) => score === variant.stackSize)) {
      independent += variant.stackSize;
    } else if (start === 0) {
      unassigned.push(scores);
    } else {
      independent += at(scores, start - 1);
    }
  }
  const free = variant.ranks.filter(
    (rank) => !state.stackStarts.includes(rank),
  );
  return independent + bestAssignment(unassigned, free, 0);
}

function bestAssignment(
  scores: ReadonlyArray<readonly number[]>,
  free: readonly number[],
  index: number,
): number {
  if (index === scores.length) {
    return 0;
  }
  let best = 0;
  for (const rank of free) {
    const value =
      at(at(scores, index), rank - 1)
      + bestAssignment(
        scores,
        free.filter((other) => other !== rank),
        index + 1,
      );
    best = Math.max(best, value);
  }
  return best;
}

export function calculateMaxScore(state: EngineState): number {
  const variant = variantFor(state);
  if (variant.sudoku && !hasReversedSuits(variant)) {
    return sudokuMaxScore(state, variant);
  }
  let score = 0;
  for (const [suit, direction] of state.playStackDirections.entries()) {
    const available = availableRanks(state, suit);
    if (hasReversedSuits(variant)) {
      const up = reversibleWalk(available, variant.upOrDown, false);
      const down = reversibleWalk(available, variant.upOrDown, true);
      switch (direction) {
        case 0: {
          score += Math.max(up, down);
          break;
        }

        case 1: {
          score += up;
          break;
        }

        case 2: {
          score += down;
          break;
        }

        case 3: {
          score += variant.stackSize;
          break;
        }

        default: {
          throw new Error("Invalid play stack direction.");
        }
      }
    } else {
      for (let rank = 1; rank <= 5; rank++) {
        if (!available.has(rank)) {
          break;
        }
        score++;
      }
    }
  }
  return score;
}

export function hasRemainingPlay(state: EngineState): boolean {
  return state.stacks.some((_, suit) => {
    const ranks = neededRanks(state, suit);
    return state.deck.some(
      (card) =>
        card.suitIndex === suit
        && ranks.includes(card.rank)
        && !card.discarded
        && !card.cannotBePlayed,
    );
  });
}
