/* eslint-disable unicorn/no-null */
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import type { Tuple } from "complete-common";
import { getVariant } from "../gameData";
import type { CardState } from "../interfaces/CardState";
import type { GameState } from "../interfaces/GameState";
import { getDefaultMetadata } from "../metadata";
import * as deckRules from "../rules/deck";
import {
  actionCardIdentity,
  colorClue,
  discard,
  draw,
  play,
  rankClue,
} from "../testActions";
import type { CardOrder } from "../types/CardOrder";
import type { NumPlayers } from "../types/NumPlayers";
import type { Rank } from "../types/Rank";
import type { SuitIndex } from "../types/SuitIndex";
import { cardsReducer } from "./cardsReducer";
import { getInitialCardState } from "./initialStates/initialCardState";
import { getInitialGameState } from "./initialStates/initialGameState";

const NUM_PLAYERS = 3;
const DEFAULT_METADATA = getDefaultMetadata(NUM_PLAYERS);
const THROW_IT_IN_A_HOLE_METADATA = getDefaultMetadata(
  NUM_PLAYERS,
  "Throw It in a Hole (4 Suits)",
);
const VARIANT = getVariant(DEFAULT_METADATA.options.variantName);
const GAME_STATE = getInitialGameState(DEFAULT_METADATA);
const THROW_IT_IN_A_HOLE_GAME_STATE = getInitialGameState(
  THROW_IT_IN_A_HOLE_METADATA,
);
const FIRST_CARD = getInitialCardState(0 as CardOrder, VARIANT, NUM_PLAYERS);
const SECOND_CARD = getInitialCardState(1 as CardOrder, VARIANT, NUM_PLAYERS);
const THIRD_CARD = getInitialCardState(2 as CardOrder, VARIANT, NUM_PLAYERS);
const FOURTH_CARD = getInitialCardState(3 as CardOrder, VARIANT, NUM_PLAYERS);
const FIFTH_CARD = getInitialCardState(4 as CardOrder, VARIANT, NUM_PLAYERS);

jest.spyOn(deckRules, "isInitialDealFinished").mockReturnValue(true);

describe("cardsReducer", () => {
  describe("location", () => {
    test("is equal to the player index when drawn", () => {
      const deck = [FIRST_CARD, SECOND_CARD];
      expect(deck[0]!.location).toBe("deck");

      let newDeck = cardsReducer(
        deck,
        draw(0, 0),
        GAME_STATE,
        DEFAULT_METADATA,
      );
      expect(newDeck[0]!.location).toBe(0);

      const gameStateNextTurn = { ...GAME_STATE, currentPlayerIndex: 1 };

      newDeck = cardsReducer(
        deck,
        draw(1, 0),
        gameStateNextTurn,
        DEFAULT_METADATA,
      );
      expect(newDeck[0]!.location).toBe(1);
    });

    test("is discard when discarded", () => {
      let deck: readonly CardState[] = [FIRST_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);

      const discardAction = discard(0, 0, 1, 2, false);
      const newDeck = cardsReducer(
        deck,
        discardAction,
        GAME_STATE,
        DEFAULT_METADATA,
      );
      expect(newDeck[0]!.location).toBe("discard");
    });

    test("is playStack when played", () => {
      let deck: readonly CardState[] = [FIRST_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);

      const playAction = play(0, 0, 1, 2);
      const newDeck = cardsReducer(
        deck,
        playAction,
        GAME_STATE,
        DEFAULT_METADATA,
      );
      expect(newDeck[0]!.location).toBe("playStack");
    });
  });

  describe("segmentDiscarded", () => {
    test("is null while on the deck", () => {
      const deck: CardState[] = [FIRST_CARD];
      expect(deck[0]!.segmentDiscarded).toBe(null);
    });

    test("is correct when discarded", () => {
      let deck: readonly CardState[] = [FIRST_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);

      const discardAction = discard(0, 0, 1, 2, false);
      const newDeck = cardsReducer(
        deck,
        discardAction,
        GAME_STATE,
        DEFAULT_METADATA,
      );
      expect(newDeck[0]!.segmentDiscarded).toBe(GAME_STATE.turn.segment);
    });

    test("is null when played", () => {
      let deck: readonly CardState[] = [FIRST_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);

      const playAction = play(0, 0, 1, 2);
      const newDeck = cardsReducer(
        deck,
        playAction,
        GAME_STATE,
        DEFAULT_METADATA,
      );
      expect(newDeck[0]!.segmentDiscarded).toBe(null);
    });

    test("is correct when misplayed", () => {
      let deck: readonly CardState[] = [FIRST_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);

      const misplay = discard(0, 0, 1, 2, true); // A misplay is a discard with "failed = true"
      const newDeck = cardsReducer(deck, misplay, GAME_STATE, DEFAULT_METADATA);
      expect(newDeck[0]!.segmentDiscarded).toBe(GAME_STATE.turn.segment);
    });
  });

  describe("segmentFirstClued", () => {
    test("remembers the segment when the first clue happened", () => {
      let deck: readonly CardState[] = [FIRST_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);
      expect(deck[0]!.segmentFirstClued).toBeNull();

      const clue1Segment = 999;
      const gameStateFirstTurn = {
        ...GAME_STATE,
        turn: { ...GAME_STATE.turn, segment: clue1Segment },
      };

      const testClue1 = rankClue(5, 1, [0], 0);
      deck = cardsReducer(
        deck,
        testClue1,
        gameStateFirstTurn,
        DEFAULT_METADATA,
      );
      expect(deck[0]!.segmentFirstClued).toEqual(clue1Segment);

      const clue2Segment = clue1Segment + 1;
      const gameStateNextTurn = {
        ...gameStateFirstTurn,
        turn: { ...gameStateFirstTurn.turn, segment: clue2Segment },
      };

      const testClue2 = colorClue(2, 2, [0], 0);
      deck = cardsReducer(deck, testClue2, gameStateNextTurn, DEFAULT_METADATA);
      expect(deck[0]!.segmentFirstClued).toEqual(clue1Segment);
    });
  });

  describe("isMisplayed", () => {
    test("is false while on the deck", () => {
      const deck: CardState[] = [FIRST_CARD];
      expect(deck[0]!.isMisplayed).toBe(false);
    });

    test("is false when discarded", () => {
      let deck: readonly CardState[] = [FIRST_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);

      const discardAction = discard(0, 0, 1, 2, false);
      const newDeck = cardsReducer(
        deck,
        discardAction,
        GAME_STATE,
        DEFAULT_METADATA,
      );
      expect(newDeck[0]!.isMisplayed).toBe(false);
    });

    test("is false when played", () => {
      let deck: readonly CardState[] = [FIRST_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);

      const playAction = play(0, 0, 1, 2);
      const newDeck = cardsReducer(
        deck,
        playAction,
        GAME_STATE,
        DEFAULT_METADATA,
      );
      expect(newDeck[0]!.isMisplayed).toBe(false);
    });

    test("is true when misplayed", () => {
      let deck: readonly CardState[] = [FIRST_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);

      const misplay = discard(0, 0, 1, 2, true); // A misplay is a discard with `failed = true`.
      const newDeck = cardsReducer(deck, misplay, GAME_STATE, DEFAULT_METADATA);
      expect(newDeck[0]!.isMisplayed).toBe(true);
    });
  });

  describe("numPositiveClues", () => {
    test("is 0 initially", () => {
      const deck: CardState[] = [FIRST_CARD];
      expect(deck[0]!.numPositiveClues).toBe(0);
    });

    test("increments by 1 after each positive clue", () => {
      let deck: readonly CardState[] = [FIRST_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);

      const clueToCardZero = rankClue(1, 2, [0], 0);
      deck = cardsReducer(deck, clueToCardZero, GAME_STATE, DEFAULT_METADATA);
      expect(deck[0]!.numPositiveClues).toBe(1);

      const anotherClueToCardZero = colorClue(0, 1, [0], 0);
      deck = cardsReducer(
        deck,
        anotherClueToCardZero,
        GAME_STATE,
        DEFAULT_METADATA,
      );
      expect(deck[0]!.numPositiveClues).toBe(2);
    });

    test("does not change after negative clues", () => {
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);
      deck = cardsReducer(deck, draw(0, 1), GAME_STATE, DEFAULT_METADATA);

      const clueToCardOne = rankClue(1, 2, [1], 0);
      deck = cardsReducer(deck, clueToCardOne, GAME_STATE, DEFAULT_METADATA);
      expect(deck[0]!.numPositiveClues).toBe(0);

      const anotherClueToCardOne = colorClue(0, 1, [1], 0);
      deck = cardsReducer(
        deck,
        anotherClueToCardOne,
        GAME_STATE,
        DEFAULT_METADATA,
      );
      expect(deck[0]!.numPositiveClues).toBe(0);
    });
  });

  describe("clue", () => {
    test("removes inferred negative possibilities on clued cards in other hand", () => {
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD, THIRD_CARD];
      let nextGameState: GameState;

      nextGameState = getGameStateWithHands(GAME_STATE, [[0], []]);
      deck = cardsReducer(deck, draw(0, 0), nextGameState, DEFAULT_METADATA);

      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], []]);
      deck = cardsReducer(deck, draw(0, 1), nextGameState, DEFAULT_METADATA);

      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], [2]]);
      deck = cardsReducer(
        deck,
        draw(1, 2, 0, 5),
        nextGameState,
        DEFAULT_METADATA,
      );

      // Load up the negative clues so we can make inferences.
      const redClue = colorClue(0, 1, [], 0);
      const yellowClue = colorClue(1, 1, [], 0);
      const greenClue = colorClue(2, 1, [], 0);
      deck = cardsReducer(deck, redClue, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, yellowClue, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, greenClue, nextGameState, DEFAULT_METADATA);

      const fivesClue = rankClue(5, 2, [0, 1], 0);
      deck = cardsReducer(deck, fivesClue, nextGameState, DEFAULT_METADATA);

      // The two fives in our hand must be blue/purple in some order. The other person will know
      // their card is not one of those fives.
      expect(isPossibleViaEmpathy(deck[2]!, 3, 5)).toBe(false);
      expect(isPossibleViaEmpathy(deck[2]!, 4, 5)).toBe(false);
    });

    test("can remove just one copy of a card from inference to other hand, if necessary", () => {
      let deck: readonly CardState[] = [
        FIRST_CARD,
        SECOND_CARD,
        THIRD_CARD,
        FOURTH_CARD,
      ];
      let nextGameState: GameState;

      nextGameState = getGameStateWithHands(GAME_STATE, [[0], []]);
      deck = cardsReducer(deck, draw(0, 0), nextGameState, DEFAULT_METADATA);

      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], []]);
      deck = cardsReducer(deck, draw(0, 1), nextGameState, DEFAULT_METADATA);

      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], [2]]);
      deck = cardsReducer(
        deck,
        draw(1, 2, 0, 4),
        nextGameState,
        DEFAULT_METADATA,
      );

      nextGameState = getGameStateWithHands(GAME_STATE, [
        [0, 1],
        [2, 3],
      ]);
      deck = cardsReducer(
        deck,
        draw(1, 3, 1, 4),
        nextGameState,
        DEFAULT_METADATA,
      );

      // Load up the negative clues so we can make inferences.
      const greenClue = colorClue(2, 1, [], 0);
      const blueClue = colorClue(3, 1, [], 0);
      const purpleClue = colorClue(4, 1, [], 0);
      deck = cardsReducer(deck, greenClue, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, blueClue, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, purpleClue, nextGameState, DEFAULT_METADATA);

      const foursClue = rankClue(4, 2, [0, 1], 0);
      deck = cardsReducer(deck, foursClue, nextGameState, DEFAULT_METADATA);

      // The two fours in our hand must be red/yellow in some order. The other person will know
      // their cards are not one of those fours, but they obviously do not rule out both copies of
      // each four.
      expect(isPossibleViaEmpathy(deck[2]!, 0, 4)).toBe(true);
      expect(isPossibleViaEmpathy(deck[2]!, 1, 4)).toBe(true);
      expect(isPossibleViaEmpathy(deck[3]!, 0, 4)).toBe(true);
      expect(isPossibleViaEmpathy(deck[3]!, 1, 4)).toBe(true);
    });

    test("inferences within other hands stay within those hands (we know their cards)", () => {
      let deck: readonly CardState[] = [
        FIRST_CARD,
        SECOND_CARD,
        THIRD_CARD,
        FOURTH_CARD,
        FIFTH_CARD,
      ];
      let nextGameState: GameState;

      nextGameState = getGameStateWithHands(GAME_STATE, [[0], []]);
      deck = cardsReducer(deck, draw(0, 0), nextGameState, DEFAULT_METADATA);

      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], []]);
      deck = cardsReducer(deck, draw(0, 1), nextGameState, DEFAULT_METADATA);

      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], [2]]);
      deck = cardsReducer(
        deck,
        draw(1, 2, 0, 4),
        nextGameState,
        DEFAULT_METADATA,
      );

      nextGameState = getGameStateWithHands(GAME_STATE, [
        [0, 1],
        [2, 3],
      ]);
      deck = cardsReducer(
        deck,
        draw(1, 3, 1, 4),
        nextGameState,
        DEFAULT_METADATA,
      );

      // Load up the negative clues so inferences can be made.
      const greenClueToOther = colorClue(2, 0, [], 1);
      const blueClueToOther = colorClue(3, 0, [], 1);
      const purpleClueToOther = colorClue(4, 0, [], 1);
      const greenClueToUs = colorClue(2, 1, [], 0);
      const blueClueToUs = colorClue(3, 1, [], 0);
      const purpleClueToUs = colorClue(4, 1, [], 0);
      deck = cardsReducer(
        deck,
        greenClueToOther,
        nextGameState,
        DEFAULT_METADATA,
      );
      deck = cardsReducer(
        deck,
        blueClueToOther,
        nextGameState,
        DEFAULT_METADATA,
      );
      deck = cardsReducer(
        deck,
        purpleClueToOther,
        nextGameState,
        DEFAULT_METADATA,
      );
      deck = cardsReducer(deck, greenClueToUs, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, blueClueToUs, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(
        deck,
        purpleClueToUs,
        nextGameState,
        DEFAULT_METADATA,
      );

      nextGameState = getGameStateWithHands(GAME_STATE, [
        [0, 1],
        [2, 3, 4],
      ]);
      deck = cardsReducer(
        deck,
        draw(1, 4, 2, 4),
        nextGameState,
        DEFAULT_METADATA,
      );

      const foursClueToUs = rankClue(4, 2, [0, 1], 0);
      const foursClueToOther = rankClue(4, 2, [2, 3, 4], 1);
      deck = cardsReducer(deck, foursClueToUs, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(
        deck,
        foursClueToOther,
        nextGameState,
        DEFAULT_METADATA,
      );

      // The other player has inferred their first two fours are red/yellow in some order. Therefore
      // they know their other four is not red/yellow.
      expect(isPossibleViaEmpathy(deck[4]!, 0, 4)).toBe(false);
      expect(isPossibleViaEmpathy(deck[4]!, 1, 4)).toBe(false);

      // We already know that the two fours in our hand are the other red/yellow fours. We do not
      // want the projected inference in the other hand to cause us to remove the remaining
      // copy/possibility of red/yellow on our fours.
      expect(isPossibleViaEmpathy(deck[0]!, 0, 4)).toBe(true);
      expect(isPossibleViaEmpathy(deck[0]!, 1, 4)).toBe(true);
      expect(isPossibleViaEmpathy(deck[1]!, 0, 4)).toBe(true);
      expect(isPossibleViaEmpathy(deck[1]!, 1, 4)).toBe(true);
    });
  });

  describe("discard", () => {
    test("eliminates a possibility on other cards", () => {
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);
      deck = cardsReducer(deck, draw(0, 1), GAME_STATE, DEFAULT_METADATA);

      const gameStateWithCorrectHands = getGameStateWithHands(GAME_STATE, [
        [0, 1],
        [],
      ]);
      const discardRed5 = discard(0, 1, 0, 5, false);
      deck = cardsReducer(
        deck,
        discardRed5,
        gameStateWithCorrectHands,
        DEFAULT_METADATA,
      );

      // Expect the remaining card to remove a possibility for a red 5.
      expect(isPossibleViaEmpathy(deck[0]!, 0, 5)).toBe(false);
    });

    test("does not eliminate a possibility if there are other copies still available", () => {
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD];
      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);
      deck = cardsReducer(deck, draw(0, 1), GAME_STATE, DEFAULT_METADATA);

      const gameStateWithCorrectHands = getGameStateWithHands(GAME_STATE, [
        [0, 1],
        [],
      ]);
      const discardRedOne = discard(0, 1, 0, 1, false);
      deck = cardsReducer(
        deck,
        discardRedOne,
        gameStateWithCorrectHands,
        DEFAULT_METADATA,
      );

      // There are 2 red ones remaining in the deck.
      expect(isPossibleViaEmpathy(deck[0]!, 0, 1)).toBe(true);
    });

    test("does not eliminate a possibility on other cards if we are playing Throw It in a Hole", () => {
      let deck: readonly CardState[] = [];
      let nextGameState = THROW_IT_IN_A_HOLE_GAME_STATE;

      // Draw a red 1 to the second player (and reveal it to us).
      deck = cardsReducer(
        deck,
        draw(1, 0, 0, 1),
        nextGameState,
        THROW_IT_IN_A_HOLE_METADATA,
      );

      // Draw a red 5 to the second player (and reveal it to us).
      nextGameState = getGameStateWithHands(GAME_STATE, [[], [0]]);
      deck = cardsReducer(
        deck,
        draw(1, 1, 0, 5),
        nextGameState,
        THROW_IT_IN_A_HOLE_METADATA,
      );

      // Discard the red 5.
      nextGameState = getGameStateWithHands(GAME_STATE, [[], [0, 1]]);
      deck = cardsReducer(
        deck,
        discard(1, 1, -1, -1, false),
        nextGameState,
        THROW_IT_IN_A_HOLE_METADATA,
      );

      // The remaining card (the red 1) cannot be a red 5 but the other player doesn't know that.
      expect(isPossible(deck[0]!, 0, 5)).toBe(false);
      expect(isPossibleViaEmpathy(deck[0]!, 0, 5)).toBe(true);
    });

    test("only eliminates possibility on card inferred with it", () => {
      let deck: readonly CardState[] = [
        FIRST_CARD,
        SECOND_CARD,
        THIRD_CARD,
        FOURTH_CARD,
      ];
      let nextGameState: GameState;

      deck = cardsReducer(deck, draw(0, 0), GAME_STATE, DEFAULT_METADATA);

      nextGameState = getGameStateWithHands(GAME_STATE, [[0], []]);
      deck = cardsReducer(deck, draw(0, 1), nextGameState, DEFAULT_METADATA);

      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], []]);
      deck = cardsReducer(
        deck,
        draw(1, 2, 0, 4),
        nextGameState,
        DEFAULT_METADATA,
      );

      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], [2]]);
      deck = cardsReducer(
        deck,
        draw(1, 3, 1, 4),
        nextGameState,
        DEFAULT_METADATA,
      );

      nextGameState = getGameStateWithHands(GAME_STATE, [
        [0, 1],
        [2, 3],
      ]);

      // Load up the negative clues so inferences can be made.
      const greenClue = colorClue(2, 1, [], 0);
      const blueClue = colorClue(3, 1, [], 0);
      const purpleClue = colorClue(4, 1, [], 0);
      deck = cardsReducer(deck, greenClue, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, blueClue, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, purpleClue, nextGameState, DEFAULT_METADATA);

      const foursClue = rankClue(4, 2, [0, 1], 0);
      deck = cardsReducer(deck, foursClue, nextGameState, DEFAULT_METADATA);
      nextGameState = getGameStateWithHands(GAME_STATE, [[1], [2, 3]]);

      // Discard red 4.
      deck = cardsReducer(
        deck,
        discard(0, 0, 0, 4, false),
        nextGameState,
        DEFAULT_METADATA,
      );

      // The other red/yellow 4 in the inferred pair from our hand is now known to not be red.
      expect(isPossibleViaEmpathy(deck[1]!, 0, 4)).toBe(false);

      // We already removed red 4 when we inferred our two fours. We shouldn't remove it a second
      // time.
      expect(isPossibleViaEmpathy(deck[2]!, 0, 4)).toBe(true);
      expect(isPossibleViaEmpathy(deck[3]!, 0, 4)).toBe(true);
    });
  });

  describe("draw", () => {
    test("eliminates a possibility on other players' cards", () => {
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD];
      const gameStateDrawP0 = getGameStateWithHands(GAME_STATE, [[0], []]);
      deck = cardsReducer(deck, draw(0, 0), gameStateDrawP0, DEFAULT_METADATA);

      // P1 draws a red 5.
      const gameStateDrawP1 = getGameStateWithHands(GAME_STATE, [[0], [1]]);
      deck = cardsReducer(
        deck,
        draw(1, 1, 0, 5),
        gameStateDrawP1,
        DEFAULT_METADATA,
      );

      // Expect the remaining card to remove a possibility for a red 5.
      expect(isPossibleViaEmpathy(deck[0]!, 0, 5)).toBe(false);
    });

    test("does not eliminate that possibility on Slow-Witted cards", () => {
      const metadata = {
        ...DEFAULT_METADATA,
        characterAssignments: [null, null, 33],
      } as const;
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD];
      // P2 draws a yellow 1.
      const gameStateDrawP2 = getGameStateWithHands(GAME_STATE, [[], [], [0]]);
      deck = cardsReducer(deck, draw(2, 0, 1, 1), gameStateDrawP2, metadata);

      // P1 draws a red 5.
      const gameStateDrawP1 = getGameStateWithHands(GAME_STATE, [[], [1], [0]]);
      deck = cardsReducer(deck, draw(1, 1, 0, 5), gameStateDrawP1, metadata);

      // The remaining card cannot be a red 5 but the other player doesn't know that.
      expect(isPossible(deck[0]!, 0, 5)).toBe(false);
      expect(isPossibleViaEmpathy(deck[0]!, 0, 5)).toBe(true);
    });

    test("does not eliminate that possibility on Oblivious cards for next player", () => {
      const metadata = {
        ...DEFAULT_METADATA,
        characterAssignments: [null, null, 30],
      } as const;
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD];
      // P2 draws a yellow 1.
      const gameStateDrawP2 = getGameStateWithHands(GAME_STATE, [[], [], [0]]);
      deck = cardsReducer(deck, draw(2, 0, 1, 1), gameStateDrawP2, metadata);

      // P1 draws a red 5.
      const gameStateDrawP1 = getGameStateWithHands(GAME_STATE, [[], [1], [0]]);
      deck = cardsReducer(deck, draw(1, 1, 0, 5), gameStateDrawP1, metadata);

      // The remaining card cannot be a red 5 but the other player doesn't know that.
      expect(isPossible(deck[0]!, 0, 5)).toBe(false);
      expect(isPossibleViaEmpathy(deck[0]!, 0, 5)).toBe(true);
    });

    test("does eliminate that possibility on Oblivious cards for previous player", () => {
      const metadata = {
        ...DEFAULT_METADATA,
        characterAssignments: [null, 30, null],
      } as const;
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD];
      // P1 draws a yellow 1.
      const gameStateDrawP2 = getGameStateWithHands(GAME_STATE, [[], [0], []]);
      deck = cardsReducer(deck, draw(1, 0, 1, 1), gameStateDrawP2, metadata);

      // P2 draws a red 5.
      const gameStateDrawP1 = getGameStateWithHands(GAME_STATE, [[], [0], [1]]);
      deck = cardsReducer(deck, draw(2, 1, 0, 5), gameStateDrawP1, metadata);

      // Expect the remaining card to not have a possibility for a red 5.
      expect(isPossibleViaEmpathy(deck[0]!, 0, 5)).toBe(false);
    });

    test("does not eliminate that possibility on Blind Spot cards for previous player", () => {
      const metadata = {
        ...DEFAULT_METADATA,
        characterAssignments: [null, 29, null],
      } as const;
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD];
      // P1 draws a yellow 1.
      const gameStateDrawP2 = getGameStateWithHands(GAME_STATE, [[], [0], []]);
      deck = cardsReducer(deck, draw(1, 0, 1, 1), gameStateDrawP2, metadata);

      // P2 draws a red 5.
      const gameStateDrawP1 = getGameStateWithHands(GAME_STATE, [[], [0], [1]]);
      deck = cardsReducer(deck, draw(2, 1, 0, 5), gameStateDrawP1, metadata);

      // The remaining card cannot be a red 5 but the other player doesn't know that.
      expect(isPossible(deck[0]!, 0, 5)).toBe(false);
      expect(isPossibleViaEmpathy(deck[0]!, 0, 5)).toBe(true);
    });

    test("does eliminate that possibility on Blind Spot cards for next player", () => {
      const metadata = {
        ...DEFAULT_METADATA,
        characterAssignments: [null, null, 29],
      } as const;
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD];
      // P2 draws a yellow 1.
      const gameStateDrawP2 = getGameStateWithHands(GAME_STATE, [[], [], [0]]);
      deck = cardsReducer(deck, draw(2, 0, 1, 1), gameStateDrawP2, metadata);

      // P1 draws a red 5.
      const gameStateDrawP1 = getGameStateWithHands(GAME_STATE, [[], [1], [0]]);
      deck = cardsReducer(deck, draw(1, 1, 0, 5), gameStateDrawP1, metadata);

      // Expect the remaining card to not a possibility for a red 5.
      expect(isPossibleViaEmpathy(deck[0]!, 0, 5)).toBe(false);
    });

    test("eliminates possibilities from previously drawn cards", () => {
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD];
      // P0 draws a red 5.
      const gameStateDrawP0 = getGameStateWithHands(GAME_STATE, [[0], []]);
      deck = cardsReducer(
        deck,
        draw(0, 0, 0, 5),
        gameStateDrawP0,
        DEFAULT_METADATA,
      );

      const gameStateDrawP1 = getGameStateWithHands(GAME_STATE, [[0], [1]]);
      deck = cardsReducer(
        deck,
        draw(1, 1, 0, 1),
        gameStateDrawP1,
        DEFAULT_METADATA,
      );

      // Expect the newly drawn card to remove a possibility for a red 5.
      expect(isPossibleViaEmpathy(deck[1]!, 0, 5)).toBe(false);
    });

    test("removes inferred negative possibilities on newly drawn card in own hand", () => {
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD, THIRD_CARD];
      let nextGameState: GameState;

      nextGameState = getGameStateWithHands(GAME_STATE, [[0], []]);
      deck = cardsReducer(deck, draw(0, 0), nextGameState, DEFAULT_METADATA);

      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], []]);
      deck = cardsReducer(deck, draw(0, 1), nextGameState, DEFAULT_METADATA);

      const fivesClue = rankClue(5, 2, [0, 1], 0);
      deck = cardsReducer(deck, fivesClue, nextGameState, DEFAULT_METADATA);

      // Load up the negative clues so we can make inferences.
      const redClue = colorClue(0, 1, [], 0);
      const yellowClue = colorClue(1, 1, [], 0);
      const greenClue = colorClue(2, 1, [], 0);
      deck = cardsReducer(deck, redClue, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, yellowClue, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, greenClue, nextGameState, DEFAULT_METADATA);

      // The two fives must be blue/purple in some order. The newly drawn card can't be one of those
      // fives.
      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1, 2], []]);
      deck = cardsReducer(deck, draw(0, 2), nextGameState, DEFAULT_METADATA);

      expect(isPossibleViaEmpathy(deck[2]!, 3, 5)).toBe(false);
      expect(isPossibleViaEmpathy(deck[2]!, 4, 5)).toBe(false);
    });

    test("removes inferred negative possibilities on newly drawn card in other hand", () => {
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD, THIRD_CARD];
      let nextGameState: GameState;

      nextGameState = getGameStateWithHands(GAME_STATE, [[0], []]);
      deck = cardsReducer(deck, draw(0, 0), nextGameState, DEFAULT_METADATA);

      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], []]);
      deck = cardsReducer(deck, draw(0, 1), nextGameState, DEFAULT_METADATA);

      const fivesClue = rankClue(5, 2, [0, 1], 0);
      deck = cardsReducer(deck, fivesClue, nextGameState, DEFAULT_METADATA);

      // Load up the negative clues so we can make inferences.
      const redClue = colorClue(0, 1, [], 0);
      const yellowClue = colorClue(1, 1, [], 0);
      const greenClue = colorClue(2, 1, [], 0);
      deck = cardsReducer(deck, redClue, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, yellowClue, nextGameState, DEFAULT_METADATA);
      deck = cardsReducer(deck, greenClue, nextGameState, DEFAULT_METADATA);

      // The two fives must be blue/purple in some order. The newly drawn card can't be one of those
      // fives.
      nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], [2]]);
      deck = cardsReducer(
        deck,
        draw(1, 2, 0, 5),
        nextGameState,
        DEFAULT_METADATA,
      );

      expect(isPossibleViaEmpathy(deck[2]!, 3, 5)).toBe(false);
      expect(isPossibleViaEmpathy(deck[2]!, 4, 5)).toBe(false);
    });

    describe("from other hand allows new inferences in own hand", () => {
      test("as Alice", () => {
        let deck: readonly CardState[] = [
          FIRST_CARD,
          SECOND_CARD,
          THIRD_CARD,
          FOURTH_CARD,
        ];
        let nextGameState: GameState;

        nextGameState = getGameStateWithHands(GAME_STATE, [[0], []]);
        deck = cardsReducer(deck, draw(0, 0), nextGameState, DEFAULT_METADATA);

        nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1], []]);
        deck = cardsReducer(deck, draw(0, 1), nextGameState, DEFAULT_METADATA);

        nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1, 2], []]);
        deck = cardsReducer(deck, draw(0, 2), nextGameState, DEFAULT_METADATA);

        const fivesClue = rankClue(5, 2, [0, 1], 0);
        deck = cardsReducer(deck, fivesClue, nextGameState, DEFAULT_METADATA);

        // Load up the negative clues so we can make inferences.
        const redClue = colorClue(0, 1, [], 0);
        const yellowClue = colorClue(1, 1, [], 0);
        deck = cardsReducer(deck, redClue, nextGameState, DEFAULT_METADATA);
        deck = cardsReducer(deck, yellowClue, nextGameState, DEFAULT_METADATA);

        // Bob draws green 5.
        nextGameState = getGameStateWithHands(GAME_STATE, [[0, 1, 2], [3]]);
        deck = cardsReducer(
          deck,
          draw(1, 3, 2, 5),
          nextGameState,
          DEFAULT_METADATA,
        );

        // Now the two fives in our hand must be blue/purple in some order. The other card in our
        // hand can't be one of those fives.
        expect(isPossibleViaEmpathy(deck[2]!, 3, 5)).toBe(false);
        expect(isPossibleViaEmpathy(deck[2]!, 4, 5)).toBe(false);

        // In addition, we know that Bob knows that his newly drawn card can't be one of those fives
        // either.
        expect(isPossibleViaEmpathy(deck[3]!, 3, 5)).toBe(false);
        expect(isPossibleViaEmpathy(deck[3]!, 4, 5)).toBe(false);
      });

      test("as Bob", () => {
        const bobMetadata = {
          ...DEFAULT_METADATA,
          ourUsername: "Bob",
          ourPlayerIndex: 1,
        } as const;
        let deck: readonly CardState[] = [
          FIRST_CARD,
          SECOND_CARD,
          THIRD_CARD,
          FOURTH_CARD,
        ];
        let nextGameState: GameState;

        nextGameState = getGameStateWithHands(GAME_STATE, [[], [0]]);
        deck = cardsReducer(deck, draw(1, 0), nextGameState, bobMetadata);

        nextGameState = getGameStateWithHands(GAME_STATE, [[], [0, 1]]);
        deck = cardsReducer(deck, draw(1, 1), nextGameState, bobMetadata);

        nextGameState = getGameStateWithHands(GAME_STATE, [[], [0, 1, 2]]);
        deck = cardsReducer(deck, draw(1, 2), nextGameState, bobMetadata);

        const fivesClue = rankClue(5, 0, [0, 1], 1);
        deck = cardsReducer(deck, fivesClue, nextGameState, bobMetadata);

        // Load up the negative clues so we can make inferences.
        const redClue = colorClue(0, 0, [], 1);
        const yellowClue = colorClue(1, 0, [], 1);
        deck = cardsReducer(deck, redClue, nextGameState, bobMetadata);
        deck = cardsReducer(deck, yellowClue, nextGameState, bobMetadata);

        // Alice draws green 5.
        nextGameState = getGameStateWithHands(GAME_STATE, [[3], [0, 1, 2]]);
        deck = cardsReducer(deck, draw(0, 3, 2, 5), nextGameState, bobMetadata);

        // Now the two fives in our hand must be blue/purple in some order. The other card in our
        // hand can't be one of those fives.
        expect(isPossibleViaEmpathy(deck[2]!, 3, 5)).toBe(false);
        expect(isPossibleViaEmpathy(deck[2]!, 4, 5)).toBe(false);

        // In addition, we know that Alice knows that her newly drawn card can't be one of those
        // fives either.
        expect(isPossibleViaEmpathy(deck[3]!, 3, 5)).toBe(false);
        expect(isPossibleViaEmpathy(deck[3]!, 4, 5)).toBe(false);
      });
    });
  });

  describe("cardIdentity", () => {
    test("eliminates a possibility on Slow-Witted cards", () => {
      const metadata = {
        ...DEFAULT_METADATA,
        characterAssignments: [null, null, 33],
      } as const;
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD, THIRD_CARD];

      // P2 draws a yellow 1.
      const gameStateDrawY1 = getGameStateWithHands(GAME_STATE, [[], [], [0]]);
      deck = cardsReducer(deck, draw(2, 0, 1, 5), gameStateDrawY1, metadata);

      // P1 draws a red 5.
      const gameStateDrawR5 = getGameStateWithHands(GAME_STATE, [[], [1], [0]]);
      deck = cardsReducer(deck, draw(1, 1, 0, 5), gameStateDrawR5, metadata);

      // P1 draws a yellow 2.
      const gameStateDrawY2 = getGameStateWithHands(GAME_STATE, [
        [],
        [2, 1],
        [0],
      ]);
      deck = cardsReducer(deck, draw(1, 2, 1, 1), gameStateDrawY2, metadata);

      deck = cardsReducer(
        deck,
        actionCardIdentity(1, 1, 0, 5),
        gameStateDrawY2,
        metadata,
      );

      // Expect the Slow-Witted card to remove a possibility for a red 5.
      expect(isPossibleViaEmpathy(deck[0]!, 0, 5)).toBe(false);
    });
  });

  describe("play", () => {
    test("eliminates a possibility on our own hand", () => {
      const metadata = DEFAULT_METADATA;
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD, THIRD_CARD];

      // P0 draws an unknown red 5.
      const gameStateDrawR5 = getGameStateWithHands(GAME_STATE, [[0], [], []]);
      deck = cardsReducer(deck, draw(0, 0, -1, -1), gameStateDrawR5, metadata);

      // P0 draws an unknown red 2.
      const gameStateDrawR2 = getGameStateWithHands(GAME_STATE, [
        [0, 1],
        [],
        [],
      ]);
      deck = cardsReducer(deck, draw(0, 1, -1, -1), gameStateDrawR2, metadata);

      // P0 clued that both cards are red.
      deck = cardsReducer(
        deck,
        colorClue(0, 1, [0, 1], 0),
        gameStateDrawR2,
        metadata,
      );

      // P0 plays red 5.
      const gameStatePlayR5 = getGameStateWithHands(GAME_STATE, [[1], [], []]);
      deck = cardsReducer(deck, play(0, 0, 0, 5), gameStatePlayR5, metadata);

      // Expect the red 2 to remove red 5 possibility.
      expect(isPossible(deck[1]!, 0, 5)).toBe(false);
      expect(isPossibleViaEmpathy(deck[1]!, 0, 5)).toBe(false);
    });

    test("eliminates a possibility on our own hand2", () => {
      const metadata = DEFAULT_METADATA;
      let deck: readonly CardState[] = [FIRST_CARD, SECOND_CARD, THIRD_CARD];

      // P0 draws an unknown red 5.
      const gameStateDrawR5 = getGameStateWithHands(GAME_STATE, [[0], [], []]);
      deck = cardsReducer(deck, draw(0, 0, 0, 5), gameStateDrawR5, metadata);

      // P0 draws an unknown red 2.
      const gameStateDrawR2 = getGameStateWithHands(GAME_STATE, [
        [0, 1],
        [],
        [],
      ]);
      deck = cardsReducer(deck, draw(0, 1, 0, 2), gameStateDrawR2, metadata);

      // P0 clued that both cards are red.
      deck = cardsReducer(
        deck,
        colorClue(0, 1, [0, 1], 0),
        gameStateDrawR2,
        metadata,
      );

      // P0 plays red 5.
      const gameStatePlayR5 = getGameStateWithHands(GAME_STATE, [[1], [], []]);
      deck = cardsReducer(deck, play(0, 0, 0, 5), gameStatePlayR5, metadata);

      // Expect the red 2 to remove red 5 possibility.
      expect(isPossible(deck[1]!, 0, 5)).toBe(false);
      expect(isPossibleViaEmpathy(deck[1]!, 0, 5)).toBe(false);
    });
  });
});

/** Helper function to cast `number[][]` to the correct type for a game state hand. */
function getGameStateWithHands(
  gameState: GameState,
  hands: ReadonlyArray<readonly number[]>,
): GameState {
  return {
    ...gameState,
    hands: hands as Tuple<CardOrder[], NumPlayers>,
  };
}

function isPossible(card: CardState, suitIndex: SuitIndex, rank: Rank) {
  return card.possibleCards.some(([s, r]) => s === suitIndex && r === rank);
}

function isPossibleViaEmpathy(
  card: CardState,
  suitIndex: SuitIndex,
  rank: Rank,
) {
  return card.possibleCardsForEmpathy.some(
    ([s, r]) => s === suitIndex && r === rank,
  );
}
