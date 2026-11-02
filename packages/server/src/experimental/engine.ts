// Zod schemas mirror the wire format; transitions return fresh owned state.
/* eslint-disable unicorn/max-nested-calls, complete/no-mutable-return */
import {
  ClueType,
  colorIndex,
  getNumCopiesOfCard,
  getVariant,
  isCardTouchedByClue,
  msgClueToClue,
  rank,
  rankClueNumber,
  suitIndex,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { randomInt } from "node:crypto";
import { z } from "zod";

// This format belongs exclusively to the experimental store, not Go seed-based history.
export const format = "ts-standard-2-v1";
const variant = getVariant("No Variant");
const integer = z.number().int().nonnegative();
export const cardSchema = z.strictObject({
  suitIndex: z.number().int().min(0).max(4),
  rank: z.number().int().min(1).max(5),
});
export type Card = z.infer<typeof cardSchema>;
export const moveSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("play"), order: integer }),
  z.strictObject({ type: z.literal("discard"), order: integer }),
  z.strictObject({
    type: z.literal("clue"),
    target: z.number().int().min(0).max(1),
    clue: z.discriminatedUnion("type", [
      z.strictObject({
        type: z.literal(ClueType.Color),
        value: z.number().int().min(0).max(4),
      }),
      z.strictObject({
        type: z.literal(ClueType.Rank),
        value: z.number().int().min(1).max(5),
      }),
    ]),
  }),
]);
type Move = z.infer<typeof moveSchema>;

const identity = {
  playerIndex: integer,
  order: integer,
  suitIndex: z.number().int(),
  rank: z.number().int(),
};
export const eventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("draw"), ...identity }),
  z.strictObject({ type: z.literal("play"), ...identity }),
  z.strictObject({
    type: z.literal("discard"),
    ...identity,
    failed: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("clue"),
    clue: z.strictObject({ type: z.number().int(), value: integer }),
    giver: integer,
    target: integer,
    list: z.array(integer),
    turn: integer,
  }),
  z.strictObject({
    type: z.literal("strike"),
    num: integer,
    turn: integer,
    order: integer,
  }),
  z.strictObject({
    type: z.literal("status"),
    clues: integer,
    score: integer,
    maxScore: integer,
  }),
  z.strictObject({
    type: z.literal("turn"),
    num: integer,
    currentPlayerIndex: z.number().int(),
  }),
  z.strictObject({
    type: z.literal("gameOver"),
    endCondition: z.number().int(),
    playerIndex: z.literal(-1),
    votes: z.null(),
  }),
  z.strictObject({
    type: z.literal("playerTimes"),
    playerTimes: z.tuple([z.literal(0), z.literal(0)]),
    duration: z.literal(0),
  }),
]);
export type SliceEvent = z.infer<typeof eventSchema>;
export const stateSchema = z.strictObject({
  hands: z.tuple([z.array(integer), z.array(integer)]),
  stacks: z.array(integer).length(5),
  discarded: z.array(integer),
  played: z.array(integer),
  touched: z.array(integer),
  failed: z.array(integer),
  next: integer,
  clues: integer.max(8),
  strikes: integer.max(3),
  turn: integer,
  active: z.number().int().min(0).max(1),
  endTurn: z.number().int(),
  end: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  score: integer,
  maxScore: integer.max(25),
});
export type State = z.infer<typeof stateSchema>;

export class RejectedError extends Error {
  override name = "RejectedError";
}

export function standardDeck(): Card[] {
  return variant.suits.flatMap((suit, index) =>
    variant.ranks.flatMap((value) =>
      Array.from({ length: getNumCopiesOfCard(suit, value, variant) }, () => ({
        suitIndex: index,
        rank: value,
      })),
    ),
  );
}

export function shuffledDeck(): Card[] {
  const deck = standardDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = deck[i];
    const b = deck[j];
    assertDefined(a, "Missing shuffle card.");
    assertDefined(b, "Missing shuffle card.");
    deck[i] = b;
    deck[j] = a;
  }
  return deck;
}

export function validateDeck(input: unknown): Card[] {
  const deck = z.array(cardSchema).length(50).parse(input);
  for (const [index, suit] of variant.suits.entries()) {
    for (const value of variant.ranks) {
      const count = deck.filter(
        (card) => card.suitIndex === index && card.rank === value,
      ).length;
      if (count !== getNumCopiesOfCard(suit, value, variant)) {
        throw new RejectedError("Only complete standard decks are supported.");
      }
    }
  }
  return deck;
}

export function initialState(): State {
  return {
    hands: [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
    ],
    stacks: [0, 0, 0, 0, 0],
    discarded: [],
    played: [],
    touched: [],
    failed: [],
    next: 10,
    clues: 8,
    strikes: 0,
    turn: 0,
    active: 0,
    endTurn: -1,
    end: 0,
    score: 0,
    maxScore: 25,
  };
}

export function initialEvents(deck: readonly Card[]): SliceEvent[] {
  return deck.slice(0, 10).map((card, order) => ({
    type: "draw",
    playerIndex: Math.floor(order / 5),
    order,
    ...card,
  }));
}

function maximumScore(deck: readonly Card[], state: State): number {
  let total = 0;
  for (const [index, stack] of state.stacks.entries()) {
    let maximum = stack;
    for (let value = stack + 1; value <= 5; value++) {
      if (
        deck.every(
          (card, order) =>
            !(card.suitIndex === index && card.rank === value)
            || state.discarded.includes(order),
        )
      ) {
        break;
      }
      maximum = value;
    }
    total += maximum;
  }
  return total;
}

/** Commands, not client projections, are the only input to this authority. */
export function applyMove(
  deck: readonly Card[],
  previous: State,
  player: number,
  move: Move,
): { state: State; events: SliceEvent[] } {
  if (previous.end !== 0 || previous.active !== player) {
    throw new RejectedError("The game is over or it is not your turn.");
  }
  const state = structuredClone(previous);
  const events: SliceEvent[] = [];
  const hand = state.hands[player];
  assertDefined(hand, "Missing hand.");
  if (move.type === "clue") {
    if (state.clues === 0 || move.target === player) {
      throw new RejectedError("Invalid clue target or no clue tokens.");
    }
    const targetHand = state.hands[move.target];
    assertDefined(targetHand, "Missing target hand.");
    const clue = msgClueToClue(
      move.clue.type === ClueType.Color
        ? { type: ClueType.Color, value: colorIndex.parse(move.clue.value) }
        : { type: ClueType.Rank, value: rankClueNumber.parse(move.clue.value) },
      variant,
    );
    const list = targetHand.filter((order) => {
      const card = deck[order];
      assertDefined(card, "Missing clue card.");
      return isCardTouchedByClue(
        variant,
        clue,
        suitIndex.parse(card.suitIndex),
        rank.parse(card.rank),
      );
    });
    if (list.length === 0) {
      throw new RejectedError("Empty clues are not supported.");
    }
    state.clues--;
    state.touched = [...new Set([...state.touched, ...list])].toSorted(
      (a, b) => a - b,
    );
    events.push({
      type: "clue",
      clue: move.clue,
      giver: player,
      target: move.target,
      list,
      turn: state.turn,
    });
  } else {
    if (!hand.includes(move.order)) {
      throw new RejectedError(
        "The card is not in your hand; deck plays are unsupported.",
      );
    }
    if (move.type === "discard" && state.clues === 8) {
      throw new RejectedError("Cannot discard at full clues.");
    }
    const card = deck[move.order];
    assertDefined(card, "Missing action card.");
    const stack = state.stacks[card.suitIndex];
    assertDefined(stack, "Missing stack.");
    const successful = move.type === "play" && card.rank === stack + 1;
    const cardIdentity = { playerIndex: player, order: move.order, ...card };
    if (successful) {
      state.stacks[card.suitIndex] = card.rank;
      state.played.push(move.order);
      state.score++;
      if (card.rank === 5) {
        state.clues = Math.min(8, state.clues + 1);
      }
      events.push({ type: "play", ...cardIdentity });
    } else {
      const failed = move.type === "play";
      if (failed) {
        state.strikes++;
        state.failed.push(move.order);
        events.push({
          type: "strike",
          num: state.strikes,
          turn: state.turn,
          order: move.order,
        });
      } else {
        state.clues++;
      }
      state.discarded.push(move.order);
      events.push({ type: "discard", ...cardIdentity, failed });
    }
    hand.splice(hand.indexOf(move.order), 1);
    if (state.next < deck.length) {
      const draw = deck[state.next];
      assertDefined(draw, "Missing draw.");
      hand.push(state.next);
      events.push({
        type: "draw",
        playerIndex: player,
        order: state.next,
        ...draw,
      });
      state.next++;
      if (state.next === deck.length) {
        state.endTurn = state.turn + 3;
      }
    }
  }
  state.maxScore = maximumScore(deck, state);
  events.push({
    type: "status",
    clues: state.clues,
    score: state.score,
    maxScore: state.maxScore,
  });
  state.turn++;
  state.active = 1 - player;
  if (state.strikes === 3) {
    state.end = 2;
  } else if (state.turn === state.endTurn || state.score === state.maxScore) {
    state.end = 1;
  }
  if (state.end !== 0) {
    // The experimental protocol has no clocks. Its duration fields are explicitly zero.
    events.push({
      type: "gameOver",
      endCondition: state.end,
      playerIndex: -1,
      // eslint-disable-next-line unicorn/no-null
      votes: null,
    });
  }
  events.push({
    type: "turn",
    num: state.turn,
    currentPlayerIndex: state.end === 0 ? state.active : -1,
  });
  if (state.end !== 0) {
    events.push({ type: "playerTimes", playerTimes: [0, 0], duration: 0 });
    if (state.end === 2) {
      state.score = 0;
    }
  }
  return { state, events };
}

export function scrubEvents(
  events: readonly SliceEvent[],
  player: number,
): SliceEvent[] {
  return events.map((event) =>
    event.type === "draw" && event.playerIndex === player
      ? { ...event, suitIndex: -1, rank: -1 }
      : structuredClone(event),
  );
}

export function playerView(
  deck: readonly Card[],
  state: State,
  player: number,
): PlayerView {
  return {
    ...structuredClone(state),
    hands: state.hands.map((hand, index) =>
      hand.map((order) => {
        const card = deck[order];
        assertDefined(card, "Missing visible card.");
        return index === player
          ? { order, suitIndex: -1, rank: -1 }
          : { order, ...card };
      }),
    ),
    revealed: [...state.played, ...state.discarded].map((order) => {
      const card = deck[order];
      assertDefined(card, "Missing revealed card.");
      return { order, ...card };
    }),
    remaining: deck.length - state.next,
  };
}

type PlayerView = Omit<State, "hands"> & {
  hands: Array<Array<{ order: number; suitIndex: number; rank: number }>>;
  revealed: Array<{ order: number; suitIndex: number; rank: number }>;
  remaining: number;
};
