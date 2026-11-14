/* eslint-disable @typescript-eslint/no-restricted-imports */

import type {
  ActionClue,
  ActionDiscard,
  ActionDraw,
  ActionPlay,
  CardIdentity,
  CardOrder,
  GameAction,
  GameState,
  NumPlayers,
  PlayerIndex,
  Rank,
  SuitIndex,
} from "@hanabi-live/game";
import {
  endConditionSchema,
  gameReducer,
  getCardsPerHand,
  getDefaultMetadata,
  getNextPlayableRanks,
  getVariantById,
  identityField,
  isCardTouchedByClue,
  MAX_PLAYERS,
  MIN_PLAYERS,
  msgClueToClue,
} from "@hanabi-live/game";
import { assertDefined, assertEnumValue, eRange } from "complete-common";
import { initialState } from "../src/game/reducers/initialStates/initialState.ts";
import { shouldStoreSegment } from "../src/game/reducers/stateReducerHelpers.ts";
import type { State } from "../src/game/types/State.ts";
import type testGame from "../test_data/up_or_down.json";

type JsonGame = typeof testGame;

enum JsonActionType {
  ActionTypePlay,
  ActionTypeDiscard,
  ActionTypeColorClue,
  ActionTypeRankClue,
  ActionTypeGameOver,
}

interface JsonAction {
  type: number;
  target: number;
  value: number;
}

export function loadGameJson(gameJson: JsonGame): State {
  const potentialNumPlayers = gameJson.players.length;
  if (potentialNumPlayers < MIN_PLAYERS || potentialNumPlayers > MAX_PLAYERS) {
    throw new Error("The game JSON does not have a valid amount of players.");
  }
  const numPlayers = potentialNumPlayers as NumPlayers;

  const metadata = getDefaultMetadata(numPlayers, gameJson.options.variant);
  const variant = getVariantById(metadata.options.variantId);

  const cardsPerHand = getCardsPerHand(metadata.options);

  /**
   * The type of `number` in the JSON is too loose for the types of `SuitIndex` and `Rank`, so we
   * must use a type assertion.
   */
  const deck = gameJson.deck as CardIdentity[];

  const actions: GameAction[] = [];
  let topOfDeck = dealInitialCards(numPlayers, cardsPerHand, actions, deck);

  // Parse all plays/discards/clues.
  let turn = 0; // Start on the 0th turn.
  let currentPlayerIndex: PlayerIndex = 0; // The player at index 0 goes first.

  for (const actionJson of gameJson.actions) {
    const action = parseJsonAction(currentPlayerIndex, turn, deck, actionJson);
    if (action !== undefined) {
      actions.push(action);
      if (
        topOfDeck < gameJson.deck.length
        && (action.type === "discard" || action.type === "play")
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
  const finalGameJsonAction = gameJson.actions.at(-1);
  assertDefined(
    finalGameJsonAction,
    "Failed to get the final action of the JSON.",
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (finalGameJsonAction.type !== JsonActionType.ActionTypeGameOver) {
    actions.push({
      type: "gameOver",
      // Assume that the game ended normally; this is not necessarily the case and will break if a
      // test game is added with a strikeout, a termination, etc.
      endCondition: "normal",
      playerIndex: currentPlayerIndex,
      voters: [],
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
        if (a.clue.type === undefined) {
          throw new Error("A test replay cannot reconstruct a hidden clue.");
        }
        const clue = msgClueToClue(a.clue, variant);
        // Fix the list of touched cards.
        const hand = s.hands[a.receiverIndex];
        assertDefined(
          hand,
          `Failed to find the hand at index: ${a.receiverIndex}`,
        );

        const list: CardOrder[] = hand.filter((order) => {
          const jsonCard = gameJson.deck[order];
          assertDefined(
            jsonCard,
            `Failed to find the JSON card at index: ${order}`,
          );

          return isCardTouchedByClue(
            variant,
            clue,
            jsonCard.suitIndex as SuitIndex,
            jsonCard.rank as Rank,
          );
        });
        action = { ...a, orders: list };
        break;
      }

      case "play": {
        // Check if this is actually a play or a misplay.
        const jsonCard = gameJson.deck[a.order] as CardIdentity | undefined;
        assertDefined(
          jsonCard,
          `Failed to get the card at order ${a.order} in the JSON deck.`,
        );
        assertDefined(
          jsonCard.suitIndex,
          `Failed to get the suit for card ${a.order} in the JSON deck.`,
        );
        assertDefined(
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

        const nextPlayableRanks = getNextPlayableRanks(
          jsonCard.suitIndex,
          playStack,
          playStackDirection,
          s.playStackStarts,
          variant,
          s.deck,
        );
        if (!nextPlayableRanks.includes(jsonCard.rank)) {
          // Send a misplay.
          action = {
            type: "misplay",
            playerIndex: a.playerIndex,
            order: a.order,
            ...(a.identity !== undefined && { identity: a.identity }),
          };
        }

        break;
      }

      default: {
        break;
      }
    }

    const previousSegment = nextState.turn.segment;
    nextState = gameReducer(nextState, action, "spectator", state.metadata);

    if (
      shouldStoreSegment(nextState.turn.segment, previousSegment, action)
      && nextState.turn.segment !== undefined
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

    startedAt: undefined,
    finishedAt: undefined,

    metadata,
    premove: undefined,
    pause: {
      pausingPlayerIndex: undefined,
      queued: false,
    },
    spectators: [],
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
  assertDefined(
    cardIdentity.suitIndex,
    `Failed to draw a card with order "${order}" since the suit index of the card identity was undefined.`,
  );
  assertDefined(
    cardIdentity.rank,
    `Failed to draw a card with order "${order}" since the rank of the card identity was undefined.`,
  );

  return {
    type: "draw",
    playerIndex,
    order,
    identity: { suitIndex: cardIdentity.suitIndex, rank: cardIdentity.rank },
  };
}

/**
 * This function mutates the `actions` array.
 *
 * @returns The order of the top of the deck.
 */
function dealInitialCards(
  numPlayers: NumPlayers,
  cardsPerHand: number,
  // eslint-disable-next-line complete/prefer-readonly-parameter-types
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

function parseJsonAction(
  currentPlayer: number,
  turn: number,
  deck: readonly CardIdentity[],
  a: JsonAction,
): GameAction | undefined {
  assertEnumValue(
    a.type,
    JsonActionType,
    `Invalid JSON action type: ${a.type}`,
  );
  switch (a.type) {
    case JsonActionType.ActionTypePlay:
    case JsonActionType.ActionTypeDiscard: {
      const isPlay = a.type === JsonActionType.ActionTypePlay;

      const cardIdentity = deck[a.target];
      assertDefined(
        cardIdentity,
        `Failed to find the card in the deck at index: ${a.target}`,
      );

      const action = {
        type: isPlay ? "play" : "discard",
        playerIndex: currentPlayer,
        order: a.target,
        ...identityField(cardIdentity),
      };

      return isPlay ? (action as ActionPlay) : (action as ActionDiscard);
    }

    case JsonActionType.ActionTypeColorClue:
    case JsonActionType.ActionTypeRankClue: {
      return {
        type: "clue",
        clue:
          a.type === JsonActionType.ActionTypeColorClue
            ? { type: "color", color: a.value }
            : { type: "rank", rank: a.value },
        playerIndex: currentPlayer,
        receiverIndex: a.target,
        turn,
        orders: [],
        ignoreNegative: false,
      } as ActionClue;
    }

    case JsonActionType.ActionTypeGameOver: {
      // The test games store an end condition as its position in the schema.
      const endCondition = endConditionSchema.options[a.value];
      assertDefined(endCondition, `Invalid end condition: ${a.value}`);
      return {
        type: "gameOver",
        endCondition,
        playerIndex: a.target as PlayerIndex,
        voters: [],
      };
    }
  }
}
