/* eslint-disable @typescript-eslint/no-restricted-imports */

import type {
  CardOrder,
  NumPlayers,
  PlayerIndex,
  Rank,
  SuitIndex,
} from "@hanabi/data";
import { MAX_PLAYERS, MIN_PLAYERS, getVariant } from "@hanabi/data";
import { assertDefined, assertNotNull, eRange } from "@hanabi/utils";
import { ClueType } from "../../game/src/enums/ClueType";
import { gameStateReducer } from "../src/game/reducers/gameStateReducer";
import { initialState } from "../src/game/reducers/initialStates/initialState";
import * as cluesRules from "../src/game/rules/clues";
import * as handRules from "../src/game/rules/hand";
import * as playStacksRules from "../src/game/rules/playStacks";
import * as segmentRules from "../src/game/rules/segment";
import { ActionType } from "../src/game/types/ActionType";
import type { CardIdentity } from "../src/game/types/CardIdentity";
import type { GameState } from "../src/game/types/GameState";
import type { State } from "../src/game/types/State";
import type {
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
  GameAction,
} from "../src/game/types/actions";
import type testGame from "../test_data/up_or_down.json";
import { testMetadata } from "./testMetadata";

type JSONGame = typeof testGame;

enum JSONActionType {
  ActionTypePlay,
  ActionTypeDiscard,
  ActionTypeColorClue,
  ActionTypeRankClue,
  ActionTypeGameOver,
}

interface JSONAction {
  type: JSONActionType;
  target: number;
  value: number;
}

export function loadGameJSON(gameJSON: JSONGame): State {
  const potentialNumPlayers = gameJSON.players.length;
  if (potentialNumPlayers < MIN_PLAYERS || potentialNumPlayers > MAX_PLAYERS) {
    throw new Error("The game JSON does not have a valid amount of players.");
  }
  const numPlayers = potentialNumPlayers as NumPlayers;

  const metadata = testMetadata(numPlayers, gameJSON.options.variant);
  const variant = getVariant(metadata.options.variantName);

  const cardsPerHand = handRules.cardsPerHand(metadata.options);

  /**
   * The type of `number` in the JSON is too loose for the types of `SuitIndex` and `Rank`, so we
   * must use a type assertion.
   */
  const deck = gameJSON.deck as unknown as CardIdentity[];

  const actions: GameAction[] = [];
  let topOfDeck = dealInitialCards(numPlayers, cardsPerHand, actions, deck);

  // Parse all plays/discards/clues.
  let turn = 0; // Start on the 0th turn.
  let currentPlayerIndex: PlayerIndex = 0; // The player at index 0 goes first.

  for (const actionJSON of gameJSON.actions) {
    const action = parseJSONAction(currentPlayerIndex, turn, deck, actionJSON);
    if (action !== null) {
      actions.push(action);
      if (
        topOfDeck < gameJSON.deck.length &&
        (action.type === "discard" || action.type === "play")
      ) {
        actions.push(drawCard(currentPlayerIndex, topOfDeck, deck));
        topOfDeck++;
      }
    }

    turn++;
    currentPlayerIndex = ((currentPlayerIndex + 1) % numPlayers) as PlayerIndex;
  }

  // If the game was exported from the server and it ended in a specific way, the final action will
  // be a "gameOver" action. Otherwise, we need to insert one at the end, which matches what the
  // server would do when emulating all of the database actions.
  const finalGameJSONAction = gameJSON.actions.at(-1);
  assertDefined(
    finalGameJSONAction,
    "Failed to get the final action of the JSON.",
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (finalGameJSONAction.type !== ActionType.GameOver) {
    actions.push({
      type: "gameOver",
      // Assume that the game ended normally; this is not necessarily the case and will break if a
      // test game is added with a strikeout, a termination, etc.
      endCondition: 1,
      playerIndex: currentPlayerIndex,
      votes: [],
    });
  }

  // Run the list of states through the state reducer. We need to fix the list of cards touched in a
  // clue, since that is not saved in the JSON. We also need to figure out if plays are successful
  // or not, since they both show up as plays in the JSON.
  const state = initialState(metadata);

  // Calculate all the intermediate states.
  const states: GameState[] = [state.ongoingGame];

  // eslint-disable-next-line unicorn/no-array-reduce
  const game = actions.reduce((s: GameState, a: GameAction) => {
    let action = a;
    let nextState = s;

    switch (a.type) {
      case "clue": {
        // Fix the list of touched cards.
        const hand = s.hands[a.target];
        assertDefined(hand, `Failed to find the hand at index: ${a.target}`);

        const list: CardOrder[] = hand.filter((order) => {
          const jsonCard = gameJSON.deck[order];
          assertDefined(
            jsonCard,
            `Failed to find the JSON card at index: ${order}`,
          );

          return cluesRules.touchesCard(
            variant,
            cluesRules.msgClueToClue(a.clue, variant),
            jsonCard.suitIndex as SuitIndex,
            jsonCard.rank as Rank,
          );
        });
        action = { ...a, list };
        break;
      }

      case "play": {
        // Check if this is actually a play or a misplay.
        const jsonCard = gameJSON.deck[a.order] as CardIdentity | undefined;
        assertDefined(
          jsonCard,
          `Failed to get the card at order ${a.order} in the JSON deck.`,
        );
        assertNotNull(
          jsonCard.suitIndex,
          `Failed to get the suit for card ${a.order} in the JSON deck.`,
        );
        assertNotNull(
          jsonCard.rank,
          `Failed to get the rank for card ${a.order} in the JSON deck.`,
        );

        const playStack = s.playStacks[jsonCard.suitIndex];
        assertDefined(
          playStack,
          `Failed to get the play stack at suit index: ${jsonCard.suitIndex}`,
        );

        const playStackDirection = s.playStackDirections[jsonCard.suitIndex];
        assertDefined(
          playStackDirection,
          `Failed to get the play stack direction at suit index: ${jsonCard.suitIndex}`,
        );

        const nextRanks = playStacksRules.nextPlayableRanks(
          jsonCard.suitIndex,
          playStack,
          playStackDirection,
          s.playStackStarts,
          variant,
          s.deck,
        );
        if (!nextRanks.includes(jsonCard.rank)) {
          // Send a discard and a strike.
          action = {
            type: "discard",
            playerIndex: a.playerIndex,
            order: a.order,
            suitIndex: a.suitIndex,
            rank: a.rank,
            failed: true,
          };
          nextState = gameStateReducer(
            s,
            action,
            false,
            false,
            false,
            false,
            state.metadata,
          );

          if (
            segmentRules.shouldStore(
              nextState.turn.segment,
              s.turn.segment,
              action,
            ) &&
            nextState.turn.segment !== null
          ) {
            states[nextState.turn.segment] = nextState;
          }

          action = {
            type: "strike",
            num: nextState.strikes.length as 1 | 2 | 3,
            order: a.order,
            turn,
          };
        }

        break;
      }

      default: {
        break;
      }
    }

    const previousSegment = nextState.turn.segment;
    nextState = gameStateReducer(
      nextState,
      action,
      false,
      false,
      false,
      false,
      state.metadata,
    );

    if (
      segmentRules.shouldStore(
        nextState.turn.segment,
        previousSegment,
        action,
      ) &&
      nextState.turn.segment !== null
    ) {
      states[nextState.turn.segment] = nextState;
    }

    return nextState;
  }, state.ongoingGame);

  return {
    visibleState: game,
    ongoingGame: game,
    replay: { ...state.replay, states },
    cardIdentities: [],

    playing: false,
    shadowing: false,
    finished: true,
    notes: {
      ourNotes: [],
      allNotes: [],
      efficiencyModifier: 0,
    },

    datetimeStarted: null,
    datetimeFinished: null,

    metadata,
    premove: null,
    pause: {
      active: false,
      playerIndex: 0,
      queued: false,
    },
    spectators: [],
    UI: {
      cardDragged: null,
    },
  };
}

function drawCard(
  playerIndex: PlayerIndex,
  order: CardOrder,
  deck: readonly CardIdentity[],
): ActionDraw {
  const cardIdentity = deck[order];
  assertDefined(
    cardIdentity,
    `Failed to draw a card with order "${order}" since the card identity was not found in the deck.`,
  );
  assertNotNull(
    cardIdentity.suitIndex,
    `Failed to draw a card with order "${order}" since the suit index of the card identity was null.`,
  );
  assertNotNull(
    cardIdentity.rank,
    `Failed to draw a card with order "${order}" since the rank of the card identity was null.`,
  );

  return {
    type: "draw",
    playerIndex,
    order,
    suitIndex: cardIdentity.suitIndex,
    rank: cardIdentity.rank,
  };
}

/** @returns The order of the top of the deck. */
function dealInitialCards(
  numPlayers: NumPlayers,
  cardsPerHand: number,
  // eslint-disable-next-line isaacscript/prefer-readonly-parameter-types
  actions: GameAction[],
  deck: readonly CardIdentity[],
): CardOrder {
  let topOfDeck = 0 as CardOrder;

  for (const i of eRange(numPlayers)) {
    const playerIndex = i as PlayerIndex;
    for (const _i of eRange(cardsPerHand)) {
      const actionDraw = drawCard(playerIndex, topOfDeck, deck);
      actions.push(actionDraw);
      topOfDeck++;
    }
  }

  return topOfDeck;
}

function parseJSONAction(
  currentPlayer: number,
  turn: number,
  deck: readonly CardIdentity[],
  a: JSONAction,
): GameAction | null {
  switch (a.type) {
    case JSONActionType.ActionTypePlay:
    case JSONActionType.ActionTypeDiscard: {
      const isPlay = a.type === JSONActionType.ActionTypePlay;

      const cardIdentity = deck[a.target];
      assertDefined(
        cardIdentity,
        `Failed to find the card in the deck at index: ${a.target}`,
      );

      const action = {
        type: isPlay ? "play" : "discard",
        playerIndex: currentPlayer,
        order: a.target,
        suitIndex: cardIdentity.suitIndex,
        rank: cardIdentity.rank,
      };

      return isPlay ? (action as ActionPlay) : (action as ActionDiscard);
    }

    case JSONActionType.ActionTypeColorClue:
    case JSONActionType.ActionTypeRankClue: {
      return {
        type: "clue",
        clue: {
          type:
            a.type === JSONActionType.ActionTypeColorClue
              ? ClueType.Color
              : ClueType.Rank,
          value: a.value,
        },
        giver: currentPlayer,
        target: a.target,
        turn,
        list: [],
        ignoreNegative: false,
      } as ActionClue;
    }

    case JSONActionType.ActionTypeGameOver: {
      return {
        type: "gameOver",
        endCondition: a.value,
        playerIndex: a.target as PlayerIndex,
        votes: [],
      };
    }

    default: {
      return null;
    }
  }
}
