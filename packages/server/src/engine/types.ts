import type { Options } from "@hanabi-live/game";
import {
  doesVariantExist,
  EndCondition,
  getVariant,
  numPlayers,
  playerIndex,
  rank,
  suitIndex,
} from "@hanabi-live/game";
import { isArray } from "complete-common";
import { z } from "zod";
import type { AssignedCharacter, DeckCard } from "./setup";

export interface PlayerAction {
  readonly type: 0 | 1 | 2 | 3;
  readonly target: number;
  readonly value: number;
}

export interface RecordedAction {
  readonly type: 0 | 1 | 2 | 3 | 4 | 5;
  readonly target: number;
  readonly value: number;
}

interface IdentityEvent<
  T extends "draw" | "play" | "cardIdentity" = "draw" | "play" | "cardIdentity",
> {
  readonly type: T;
  readonly playerIndex: number;
  readonly order: number;
  readonly suitIndex: number;
  readonly rank: number;
}

export type EngineEvent =
  | IdentityEvent<"draw">
  | IdentityEvent<"play">
  | IdentityEvent<"cardIdentity">
  | (Omit<IdentityEvent, "type"> & {
      readonly type: "discard";
      readonly failed: boolean;
    })
  | {
      readonly type: "clue";
      readonly clue: { readonly type: 0 | 1; readonly value: number };
      readonly giver: number;
      readonly target: number;
      readonly list: readonly number[];
      readonly turn: number;
    }
  | {
      readonly type: "strike";
      readonly num: number;
      readonly turn: number;
      readonly order: number;
    }
  | {
      readonly type: "status";
      readonly clues: number;
      readonly score: number;
      readonly maxScore: number;
    }
  | {
      readonly type: "turn";
      readonly num: number;
      readonly currentPlayerIndex: number;
    }
  | {
      readonly type: "gameOver";
      readonly endCondition: EndCondition;
      readonly playerIndex: number;
      readonly votes: readonly number[] | null;
    }
  | {
      readonly type: "playerTimes";
      readonly playerTimes: readonly number[];
      readonly duration: number;
    };

export interface MutableCard extends DeckCard {
  readonly order: number;
  slot: number;
  touched: boolean;
  discarded: boolean;
  played: boolean;
  failed: boolean;
  cannotBePlayed: boolean;
  insistentTouched: boolean;
}

export interface MutablePlayer {
  readonly name: string;
  readonly index: number;
  readonly character: string;
  characterMetadata: number;
  hand: number[];
}

export interface MutableEngineState {
  readonly options: Options;
  readonly seed: string;
  /** Historical actions already encode inverted play/discard interpretation. */
  readonly interpretation: "live" | "legacy-replay";
  players: MutablePlayer[];
  deck: MutableCard[];
  deckIndex: number;
  stacks: number[];
  stackStarts: number[];
  playStackDirections: number[];
  turn: number;
  turnsInverted: boolean;
  activePlayerIndex: number;
  clueTokens: number;
  score: number;
  maxScore: number;
  strikes: number;
  lastClueTypeGiven: number;
  endCondition: EndCondition;
  endPlayer: number;
  endTurn: number;
  startedTimer: boolean;
  paused: boolean;
  events: EngineEvent[];
  actions: RecordedAction[];
}

export interface EnginePlayer extends Readonly<Omit<MutablePlayer, "hand">> {
  readonly hand: readonly number[];
}

export interface EngineState extends Readonly<
  Omit<
    MutableEngineState,
    | "players"
    | "deck"
    | "stacks"
    | "stackStarts"
    | "playStackDirections"
    | "events"
    | "actions"
  >
> {
  readonly players: readonly EnginePlayer[];
  readonly deck: ReadonlyArray<Readonly<MutableCard>>;
  readonly stacks: readonly number[];
  readonly stackStarts: readonly number[];
  readonly playStackDirections: readonly number[];
  readonly events: readonly EngineEvent[];
  readonly actions: readonly RecordedAction[];
}

export interface GameSetup {
  readonly options: Options;
  /** Already ordered seats; lobby seat shuffling belongs to the caller. */
  readonly playerNames: readonly string[];
  readonly seed: string;
  /** Trusted prepared order, including custom runtime decks; not an import validator. */
  readonly deck?: readonly DeckCard[];
  readonly characters?: readonly AssignedCharacter[];
  readonly interpretation?: "live" | "legacy-replay";
}

export interface Transition {
  readonly state: EngineState;
  readonly events: readonly EngineEvent[];
}

/** Optional externally accounted times in milliseconds, used only on completion. */
export interface CompletionTiming {
  readonly playerTimes: readonly number[];
  readonly duration: number;
}

export interface Termination {
  /** Requesting player, which can differ from the current turn or blamed player. */
  readonly actorIndex: number;
  readonly condition:
    | EndCondition.Timeout
    | EndCondition.TerminatedByPlayer
    | EndCondition.TerminatedByVote
    | EndCondition.IdleTimeout
    | EndCondition.AllOrNothingFail;
  readonly playerIndex: number;
  readonly votes?: readonly number[];
}

class ActionRejectedError extends Error {
  override readonly name = "ActionRejectedError";
  readonly silent: boolean;

  constructor(
    message: string,
    options?: ErrorOptions & { readonly silent?: boolean },
  ) {
    super(message, options);
    this.silent = options?.silent ?? false;
  }
}

export { ActionRejectedError as ActionRejected };

function boundedArray<T extends z.ZodType>(element: T, maximum: number) {
  // Check before traversing elements; Zod's array.max alone still decodes every element.
  return z
    .unknown()
    .refine((value) => isArray(value) && value.length <= maximum, {
      message: `Expected an array with at most ${maximum} elements.`,
      abort: true,
    })
    .pipe(z.array(element));
}

// The catalog has at most 60 cards. Each card is consumed at most once and generates at most one
// token. Clues cost at least one token (two in Clue Starved, which starts with twice as many). Thus
// D cards permit at most D + 8 clues, 2D + 8 player actions, and one server termination.
// Draws/slot-two identities contribute at most 2D events; each player action contributes three
// other events, plus at most three strikes and four terminal events: at most 8D + 31 events. At D =
// 60 this is 129 recorded actions / 511 events, even with repeated character actions. Keep generous
// decoding margins; rejected requests and transport clock ticks are not history.
const MAX_RESTORED_CARDS = 60;
const MAX_RESTORED_ACTIONS = 512;
const MAX_RESTORED_EVENTS = 4096;

const integer = z.int();
const nonnegative = integer.min(0);
const seat = integer.min(0).max(5);
const order = integer.min(0).max(MAX_RESTORED_CARDS - 1);
const text = z.string().max(4096);
const restoredOptions = z.strictObject({
  numPlayers: integer.min(2).max(6).pipe(numPlayers),
  startingPlayer: seat.pipe(playerIndex),
  variantName: text.min(1),
  variantID: nonnegative.optional(),
  timed: z.boolean(),
  timeBase: z
    .number()
    .min(-Number.MAX_SAFE_INTEGER)
    .max(Number.MAX_SAFE_INTEGER),
  timePerTurn: integer,
  speedrun: z.boolean(),
  cardCycle: z.boolean(),
  deckPlays: z.boolean(),
  emptyClues: z.boolean(),
  oneExtraCard: z.boolean(),
  oneLessCard: z.boolean(),
  allOrNothing: z.boolean(),
  detrimentalCharacters: z.boolean(),
  tableName: text.min(1).optional(),
  maxPlayers: integer.min(2).max(6).pipe(numPlayers).optional(),
});
const restoredCard = z.strictObject({
  suitIndex,
  rank,
  order,
  slot: integer.min(-1).max(6),
  touched: z.boolean(),
  discarded: z.boolean(),
  played: z.boolean(),
  failed: z.boolean(),
  cannotBePlayed: z.boolean(),
  insistentTouched: z.boolean(),
});
const restoredPlayer = z.strictObject({
  name: text,
  index: seat,
  character: text,
  characterMetadata: integer,
  hand: boundedArray(order, 6),
});
const identityFields = { playerIndex: seat, order, suitIndex, rank };
const restoredClue = z.strictObject({
  type: z.union([z.literal(0), z.literal(1)]),
  value: nonnegative.max(5),
});
const restoredEvent = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("draw"), ...identityFields }),
  z.strictObject({ type: z.literal("play"), ...identityFields }),
  z.strictObject({ type: z.literal("cardIdentity"), ...identityFields }),
  z.strictObject({
    type: z.literal("discard"),
    ...identityFields,
    failed: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("clue"),
    clue: restoredClue,
    giver: seat,
    target: seat,
    list: boundedArray(order, 6),
    turn: nonnegative,
  }),
  z.strictObject({
    type: z.literal("strike"),
    num: integer.min(1).max(3),
    turn: nonnegative,
    order,
  }),
  z.strictObject({
    type: z.literal("status"),
    clues: nonnegative.max(16),
    score: nonnegative.max(30),
    maxScore: nonnegative.max(30),
  }),
  z.strictObject({
    type: z.literal("turn"),
    num: nonnegative,
    currentPlayerIndex: integer.min(-1).max(5),
  }),
  z.strictObject({
    type: z.literal("gameOver"),
    endCondition: z
      .enum(EndCondition)
      .refine(
        (condition) => condition !== EndCondition.InProgress,
        "A game-over event must have an ending condition.",
      ),
    playerIndex: integer.min(-1).max(5),
    votes: boundedArray(seat, 6).nullable(),
  }),
  z.strictObject({
    type: z.literal("playerTimes"),
    playerTimes: boundedArray(integer, 6),
    duration: nonnegative,
  }),
]);
const restoredAction = z.strictObject({
  type: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  target: integer.min(-1).max(MAX_RESTORED_CARDS - 1),
  value: integer,
});
const restoredState = z
  .strictObject({
    options: restoredOptions,
    seed: text,
    interpretation: z.enum(["live", "legacy-replay"]),
    players: boundedArray(restoredPlayer, 6).refine(
      (players: readonly unknown[]) => players.length >= 2,
      "A game must have at least two players.",
    ),
    deck: boundedArray(restoredCard, MAX_RESTORED_CARDS).refine(
      (deck: readonly unknown[]) => deck.length > 0,
      "A game must have a deck.",
    ),
    deckIndex: nonnegative.max(MAX_RESTORED_CARDS),
    stacks: boundedArray(
      integer
        .min(0)
        .max(7)
        .refine((value) => value !== 6),
      6,
    ),
    stackStarts: boundedArray(nonnegative.max(5), 6),
    playStackDirections: boundedArray(nonnegative.max(3), 6),
    turn: nonnegative,
    turnsInverted: z.boolean(),
    activePlayerIndex: seat,
    clueTokens: nonnegative.max(16),
    score: nonnegative.max(30),
    maxScore: nonnegative.max(30),
    strikes: nonnegative.max(3),
    lastClueTypeGiven: integer.min(-1).max(1),
    endCondition: z.enum(EndCondition),
    endPlayer: integer.min(-1).max(5),
    endTurn: integer.min(-1),
    startedTimer: z.boolean(),
    paused: z.boolean(),
    events: boundedArray(restoredEvent, MAX_RESTORED_EVENTS),
    actions: boundedArray(restoredAction, MAX_RESTORED_ACTIONS),
  })
  .superRefine(validateRestoredState);

function validateRestoredState(state: EngineState, context: z.RefinementCtx) {
  if (!doesVariantExist(state.options.variantName)) {
    context.addIssue({
      code: "custom",
      path: ["options", "variantName"],
      message: "Unknown game variant.",
    });
    return;
  }
  const variant = getVariant(state.options.variantName);
  const count = state.players.length;
  const clueLimit = variant.clueStarved ? 16 : 8;
  function requireValid(
    valid: boolean,
    path: ReadonlyArray<string | number>,
    message: string,
  ) {
    if (!valid) {
      context.addIssue({ code: "custom", path: [...path], message });
    }
  }

  function validSeat(index: number) {
    return index >= 0 && index < count;
  }

  function validOrder(index: number) {
    return index >= 0 && index < state.deckIndex && index < state.deck.length;
  }

  function validClue(type: number, value: number) {
    const clueRanks: readonly number[] = variant.clueRanks;
    return type === 0
      ? value >= 0 && value < variant.clueColors.length
      : clueRanks.includes(value);
  }
  requireValid(
    state.options.numPlayers === count,
    ["options", "numPlayers"],
    "Player count mismatch.",
  );
  requireValid(
    state.options.maxPlayers === undefined || state.options.maxPlayers >= count,
    ["options", "maxPlayers"],
    "Player count exceeds the configured capacity.",
  );
  requireValid(
    validSeat(state.options.startingPlayer),
    ["options", "startingPlayer"],
    "Invalid starting seat.",
  );
  requireValid(
    validSeat(state.activePlayerIndex),
    ["activePlayerIndex"],
    "Invalid active seat.",
  );
  requireValid(
    state.endPlayer === -1 || validSeat(state.endPlayer),
    ["endPlayer"],
    "Invalid ending seat.",
  );
  requireValid(
    state.endCondition !== EndCondition.InProgress || state.endPlayer === -1,
    ["endPlayer"],
    "An ongoing game cannot have an ending player.",
  );
  requireValid(
    state.endCondition !== EndCondition.Timeout || validSeat(state.endPlayer),
    ["endPlayer"],
    "A timeout must identify a player.",
  );
  requireValid(
    state.deckIndex <= state.deck.length,
    ["deckIndex"],
    "Draw cursor exceeds the deck.",
  );
  requireValid(
    state.endTurn === -1 || state.endTurn >= state.turn,
    ["endTurn"],
    "Final turn precedes the current turn.",
  );
  requireValid(
    state.turn <= state.actions.length + 1
      && (state.endTurn === -1 || state.endTurn <= state.turn + count + 1),
    ["turn"],
    "Turn counters exceed the bounded action history.",
  );
  requireValid(
    state.clueTokens <= clueLimit,
    ["clueTokens"],
    "Clues exceed the variant limit.",
  );
  requireValid(
    state.score <= state.maxScore && state.maxScore <= variant.maxScore,
    ["maxScore"],
    "Invalid score bounds.",
  );
  for (const key of ["stacks", "stackStarts", "playStackDirections"] as const) {
    requireValid(
      state[key].length === variant.suits.length,
      [key],
      "Stack count does not match the variant.",
    );
  }
  const reversible =
    variant.upOrDown || variant.suits.some((suit) => suit.reversed);
  if (variant.sudoku) {
    const starts = state.stackStarts.filter((start) => start !== 0);
    requireValid(
      new Set(starts).size === starts.length
        && state.stacks.every(
          (stack, index) => stack === 0 || state.stackStarts[index] !== 0,
        ),
      ["stackStarts"],
      "Invalid Sudoku starting ranks.",
    );
  } else {
    requireValid(
      state.stackStarts.every((start) => start === 0),
      ["stackStarts"],
      "Only Sudoku variants have stack starts.",
    );
  }
  if (!reversible) {
    requireValid(
      state.playStackDirections.every(
        (direction) => direction === 0 || (variant.sudoku && direction === 3),
      ),
      ["playStackDirections"],
      "Invalid direction for this variant.",
    );
  } else if (!variant.upOrDown) {
    requireValid(
      state.playStackDirections.every((direction) => direction !== 0),
      ["playStackDirections"],
      "Reversed stacks must have a direction.",
    );
  }
  requireValid(
    state.options.allOrNothing || state.deckIndex < state.deck.length
      ? state.endTurn === -1
      : state.endTurn !== -1,
    ["endTurn"],
    "Final-round state does not match the deck cursor.",
  );
  const held = new Set<number>();
  const normalHandSize = count <= 3 ? 5 : 4;
  const handSize =
    (count === 6 ? 3 : normalHandSize)
    + Number(state.options.oneExtraCard)
    - Number(state.options.oneLessCard);
  for (const [index, player] of state.players.entries()) {
    requireValid(
      player.index === index,
      ["players", index, "index"],
      "Player indexes must match their seats.",
    );
    requireValid(
      player.hand.length <= handSize,
      ["players", index, "hand"],
      "Hand exceeds the configured size.",
    );
    if (player.character === "Genius") {
      requireValid(
        player.characterMetadata === -1
          || (validSeat(player.characterMetadata)
            && player.characterMetadata !== index),
        ["players", index, "characterMetadata"],
        "Invalid second-clue target.",
      );
    }
    for (const [position, cardOrder] of player.hand.entries()) {
      const card = state.deck[cardOrder];
      requireValid(
        validOrder(cardOrder)
          && card !== undefined
          && !card.played
          && !card.discarded
          && !held.has(cardOrder),
        ["players", index, "hand", position],
        "Invalid, duplicate, or unavailable hand card.",
      );
      held.add(cardOrder);
    }
  }
  for (const [index, card] of state.deck.entries()) {
    const cardPath = ["deck", index];
    requireValid(
      card.order === index,
      [...cardPath, "order"],
      "Card orders must match the deck.",
    );
    requireValid(
      card.suitIndex < variant.suits.length,
      [...cardPath, "suitIndex"],
      "Card suit is outside the variant.",
    );
    requireValid(
      !(card.played && card.discarded) && (!card.failed || card.discarded),
      cardPath,
      "Inconsistent card disposition.",
    );
    if (index < state.deckIndex) {
      requireValid(
        held.has(index) || card.played || card.discarded,
        cardPath,
        "A drawn card has no location.",
      );
    } else {
      requireValid(
        !card.played
          && !card.discarded
          && !card.touched
          && !card.cannotBePlayed
          && !card.insistentTouched
          && card.slot === 0,
        cardPath,
        "A card that has not been drawn has mutable game state.",
      );
    }
  }
  const drawn = new Set<number>();
  const historyHands = state.players.map((): number[] => []);
  const historyCards = state.deck.map(() => ({
    touched: false,
    played: false,
    discarded: false,
    failed: false,
    slot: 0,
  }));
  const historyStacks = variant.suits.map(() => 0);
  const historyActions: RecordedAction[] = [];
  let strikeCount = 0;
  let gameOverCount = 0;
  let lastTurn: Extract<EngineEvent, { readonly type: "turn" }> | undefined;
  for (const [index, event] of state.events.entries()) {
    const eventPath = ["events", index];
    if ("playerIndex" in event) {
      requireValid(
        validSeat(event.playerIndex)
          || (event.type === "gameOver" && event.playerIndex === -1),
        [...eventPath, "playerIndex"],
        "Invalid event player.",
      );
    }
    if ("order" in event) {
      requireValid(
        validOrder(event.order),
        [...eventPath, "order"],
        "Invalid event card.",
      );
    }
    if ("suitIndex" in event) {
      const card = state.deck[event.order];
      requireValid(
        card !== undefined
          && card.suitIndex === event.suitIndex
          && card.rank === event.rank,
        eventPath,
        "Event identity does not match the authoritative deck.",
      );
    }
    if ("turn" in event) {
      requireValid(
        event.turn <= state.turn,
        [...eventPath, "turn"],
        "Event occurs after the current turn.",
      );
    }
    switch (event.type) {
      case "draw": {
        requireValid(
          event.order === drawn.size && !drawn.has(event.order),
          eventPath,
          "Draw history is not sequential.",
        );
        drawn.add(event.order);
        historyHands[event.playerIndex]?.push(event.order);
        break;
      }

      case "play":
      case "discard": {
        const hand = historyHands[event.playerIndex];
        const position = hand?.indexOf(event.order);
        const card = historyCards[event.order];
        requireValid(
          hand !== undefined
            && position !== undefined
            && position >= 0
            && card !== undefined
            && !card.played
            && !card.discarded,
          eventPath,
          "Card removal does not match the historical hand.",
        );
        if (
          hand === undefined
          || position === undefined
          || position < 0
          || card === undefined
        ) {
          break;
        }
        card.slot = hand.length - position;
        hand.splice(position, 1);
        if (event.type === "play") {
          card.played = true;
          historyStacks[event.suitIndex] = event.rank;
          historyActions.push({ type: 0, target: event.order, value: 0 });
        } else {
          card.discarded = true;
          requireValid(
            event.failed === card.failed,
            eventPath,
            "Failed discard does not match a strike.",
          );
          if (!event.failed) {
            historyActions.push({ type: 1, target: event.order, value: 0 });
          }
        }
        break;
      }

      case "cardIdentity": {
        requireValid(
          historyHands[event.playerIndex]?.at(-2) === event.order,
          eventPath,
          "Card identity does not identify the historical second slot.",
        );
        break;
      }

      case "strike": {
        strikeCount++;
        const card = historyCards[event.order];
        requireValid(
          event.num === strikeCount
            && card !== undefined
            && !card.failed
            && historyHands.some((hand: readonly number[]) =>
              hand.includes(event.order),
            ),
          eventPath,
          "Invalid strike history.",
        );
        if (card !== undefined) {
          card.failed = true;
        }
        historyActions.push({ type: 0, target: event.order, value: 0 });
        break;
      }

      case "clue": {
        requireValid(
          validSeat(event.giver)
            && validSeat(event.target)
            && event.giver !== event.target,
          eventPath,
          "Invalid clue participants.",
        );
        requireValid(
          validClue(event.clue.type, event.clue.value),
          [...eventPath, "clue"],
          "Invalid variant clue.",
        );
        requireValid(
          event.list.every(validOrder)
            && new Set(event.list).size === event.list.length,
          [...eventPath, "list"],
          "Invalid clue card list.",
        );
        requireValid(
          event.list.every(
            (cardOrder) =>
              historyHands[event.target]?.includes(cardOrder) === true,
          ),
          [...eventPath, "list"],
          "Clue cards are not in the historical target hand.",
        );
        for (const cardOrder of event.list) {
          const card = historyCards[cardOrder];
          if (card !== undefined) {
            card.touched = true;
          }
        }
        historyActions.push({
          type: event.clue.type === 0 ? 2 : 3,
          target: event.target,
          value: event.clue.value,
        });
        if (state.options.cardCycle) {
          const hand = historyHands[event.giver];
          const chop = hand?.findIndex(
            (cardOrder) => historyCards[cardOrder]?.touched === false,
          );
          if (hand !== undefined && chop !== undefined && chop >= 0) {
            const cardOrder = hand[chop];
            if (cardOrder !== undefined) {
              hand.splice(chop, 1);
              hand.push(cardOrder);
            }
          }
        }
        break;
      }

      case "turn": {
        requireValid(
          event.num <= state.turn
            && (event.currentPlayerIndex === -1
              || validSeat(event.currentPlayerIndex)),
          eventPath,
          "Invalid turn event.",
        );
        requireValid(
          (lastTurn === undefined || event.num >= lastTurn.num)
            && (event.currentPlayerIndex !== -1
              || state.endCondition !== EndCondition.InProgress),
          eventPath,
          "Inconsistent turn history.",
        );
        lastTurn = event;
        break;
      }

      case "status": {
        requireValid(
          event.clues <= clueLimit
            && event.score <= event.maxScore
            && event.maxScore <= variant.maxScore,
          eventPath,
          "Invalid status bounds.",
        );
        break;
      }

      case "gameOver": {
        gameOverCount++;
        requireValid(
          gameOverCount === 1
            && event.endCondition === state.endCondition
            && event.playerIndex === state.endPlayer,
          eventPath,
          "Game-over event does not match the ending state.",
        );
        requireValid(
          event.votes === null
            || (event.votes.every(validSeat)
              && new Set(event.votes).size === event.votes.length),
          [...eventPath, "votes"],
          "Invalid termination votes.",
        );
        break;
      }

      case "playerTimes": {
        requireValid(
          state.endCondition !== EndCondition.InProgress
            && state.interpretation === "live"
            && index === state.events.length - 1,
          eventPath,
          "Completion timing must finish a live game's history.",
        );
        requireValid(
          event.playerTimes.length === count,
          [...eventPath, "playerTimes"],
          "Clock count mismatch.",
        );
        break;
      }
    }
  }
  requireValid(
    drawn.size === state.deckIndex,
    ["events"],
    "Draw history does not match the deck cursor.",
  );
  requireValid(
    lastTurn === undefined
      ? state.turn === 0 && state.actions.length === 0
      : lastTurn.num === state.turn
          && lastTurn.currentPlayerIndex
            === (state.endCondition === EndCondition.InProgress
              ? state.activePlayerIndex
              : -1),
    ["turn"],
    "Current turn does not match its event history.",
  );
  requireValid(
    strikeCount === state.strikes,
    ["strikes"],
    "Strike counter does not match history.",
  );
  requireValid(
    historyStacks.every((stack, index) => stack === state.stacks[index]),
    ["stacks"],
    "Stacks do not match the play history.",
  );
  for (const [index, player] of state.players.entries()) {
    const hand = historyHands[index];
    requireValid(
      hand !== undefined
        && hand.length === player.hand.length
        && hand.every(
          (cardOrder, position) => cardOrder === player.hand[position],
        ),
      ["players", index, "hand"],
      "Hand does not match its action history.",
    );
  }
  for (const [index, card] of state.deck.entries()) {
    const historical = historyCards[index];
    requireValid(
      historical !== undefined
        && card.touched === historical.touched
        && card.played === historical.played
        && card.discarded === historical.discarded
        && card.failed === historical.failed
        && (card.slot === historical.slot
          || (card.slot === -1
            && historical.slot === 1
            && state.options.deckPlays
            && index === state.deck.length - 1)),
      ["deck", index],
      "Card state does not match its action history.",
    );
  }
  const playedCount = historyCards.filter((card) => card.played).length;
  requireValid(
    state.score
      === (state.endCondition > EndCondition.Normal ? 0 : playedCount),
    ["score"],
    "Score does not match the play history.",
  );
  const ordinaryActions = state.actions.filter((action) => action.type < 4);
  const terminalActions = state.actions.filter((action) => action.type >= 4);
  requireValid(
    terminalActions.length === 0
      || (terminalActions.length === 1
        && state.endCondition !== EndCondition.InProgress
        && terminalActions[0] === state.actions.at(-1)),
    ["actions"],
    "A server termination must be the final recorded action.",
  );
  requireValid(
    ordinaryActions.length === historyActions.length
      && ordinaryActions.every((action, index) => {
        const historical = historyActions[index];
        return (
          historical !== undefined
          && action.type === historical.type
          && action.target === historical.target
          && action.value === historical.value
        );
      }),
    ["actions"],
    "Recorded actions do not match the event history.",
  );
  for (const [index, action] of state.actions.entries()) {
    const actionPath = ["actions", index];
    switch (action.type) {
      case 0:
      case 1: {
        requireValid(
          validOrder(action.target) && action.value === 0,
          actionPath,
          "Invalid recorded card action.",
        );
        break;
      }

      case 2:
      case 3: {
        requireValid(
          validSeat(action.target) && validClue(action.type - 2, action.value),
          actionPath,
          "Invalid recorded clue.",
        );
        break;
      }

      case 5: {
        const condition = z.enum(EndCondition).safeParse(action.value);
        requireValid(
          action.target === -1
            && condition.success
            && condition.data === EndCondition.TerminatedByVote,
          actionPath,
          "Invalid recorded vote termination.",
        );
        break;
      }

      case 4: {
        const condition = z.enum(EndCondition).safeParse(action.value);
        requireValid(
          condition.success
            && ((condition.data === EndCondition.Timeout
              && validSeat(action.target))
              || (condition.data === EndCondition.TerminatedByPlayer
                && (action.target === -1 || validSeat(action.target)))
              || (condition.data === EndCondition.IdleTimeout
                && action.target === -1)),
          actionPath,
          "Invalid recorded server termination.",
        );
        break;
      }
    }
  }
}

/**
 * Decode an owned checkpoint without defaults; throws ZodError on malformed state. Limits: 60
 * cards, 512 actions, 4096 events. Recipient-scrubbed histories are not checkpoints.
 */
export function parseEngineState(value: unknown): EngineState {
  return restoredState.parse(value);
}
