// Calculates the state of the deck after an action

import { ensureAllCases, nullIfNegative } from "../../misc";
import { getCharacter, getVariant } from "../data/gameData";
import { cluesRules, deckRules, handRules } from "../rules";
import * as characterRules from "../rules/variants/characters";
import { GameAction } from "../types/actions";
import CardState from "../types/CardState";
import { colorClue, rankClue } from "../types/Clue";
import ClueType from "../types/ClueType";
import GameMetadata from "../types/GameMetadata";
import GameState from "../types/GameState";
import cardDeductionReducer from "./cardDeductionReducer";
import cardPossibilitiesReducer from "./cardPossibilitiesReducer";
import initialCardState from "./initialStates/initialCardState";
import { getCharacterIDForPlayer } from "./reducerHelpers";

export default function cardsReducer(
  deck: readonly CardState[],
  action: GameAction,
  game: GameState,
  metadata: GameMetadata,
): CardState[] {
  const variant = getVariant(metadata.options.variantName);
  const newDeck = Array.from(deck);
  const hands = Array.from(game.hands, (arr) => Array.from(arr));

  switch (action.type) {
    // If we are in a game with a "Slow-Witted" character,
    // the server will announce the identities of the cards that slide from slot 1 to slot 2
    // { type: 'cardIdentity', playerIndex: 0, order: 0, rank: 1, suitIndex: 4 }
    case "cardIdentity": {
      const { order } = action;
      let card = getCard(deck, order);
      card = {
        ...card,
        revealedToPlayer: cardIdentityRevealedToPlayer(card, metadata),
      };
      newDeck[order] = card;
      if (characterRules.shouldSeeSlot2CardIdentity(metadata) === false) {
        break;
      }

      if (
        action.playerIndex === metadata.ourPlayerIndex ||
        action.suitIndex === -1 ||
        action.rank === -1
      ) {
        // The server scrubs the identity from cards that slide from slot 1 to slot 2 in our own
        // hand in order to prevent leaking information
        break;
      }

      if (card.suitIndex !== null && card.rank !== null) {
        // We already know the full identity of this card, so we can safely ignore this action
        break;
      }

      newDeck[order] = {
        ...card,
        suitIndex: action.suitIndex,
        rank: action.rank,
      };

      break;
    }

    case "clue": {
      const clue =
        action.clue.type === ClueType.Color
          ? colorClue(variant.clueColors[action.clue.value])
          : rankClue(action.clue.value);

      const applyClue = (order: number, positive: boolean) => {
        // Clues do not have to be applied in certain situations
        if (!cluesRules.shouldApplyClue(action.giver, metadata, variant)) {
          return;
        }

        const card = getCard(newDeck, order);
        const newCard = cardPossibilitiesReducer(card, clue, positive, metadata);
        newDeck[order] = newCard;
      };

      // Positive clues
      action.list.forEach((order) => {
        const card = getCard(newDeck, order);
        const hand = game.hands[action.target];
        newDeck[order] = {
          ...card,
          numPositiveClues: card.numPositiveClues + 1,
          segmentFirstClued:
            card.segmentFirstClued === null
              ? game.turn.segment!
              : card.segmentFirstClued,
          hasClueApplied: true,
          firstCluedWhileOnChop:
            card.firstCluedWhileOnChop === null
              ? handRules.cardIsOnChop(hand, deck, card)
              : card.firstCluedWhileOnChop,
        };
        applyClue(order, true);
      });

      // Negative clues
      hands[action.target]
        .filter((order) => !action.list.includes(order))
        .forEach((order) => {
          const card = getCard(newDeck, order);
          newDeck[order] = {
            ...card,
            hasClueApplied: true,
          };
          applyClue(order, false);
        });

      break;
    }

    case "discard":
    case "play": {
      const { order } = action;
      const card = getCard(deck, order);

      // If the rank or suit coming from the action is null, prefer what we already had inferred
      const suitIndex = nullIfNegative(action.suitIndex) ?? card.suitIndex;
      const rank = nullIfNegative(action.rank) ?? card.rank;

      const identityDetermined = revealCard(
        suitIndex,
        rank,
        card,
      );

      let { segmentPlayed } = card;
      let { segmentDiscarded } = card;
      let { location } = card;
      let { isMisplayed } = card;

      if (action.type === "play") {
        location = "playStack";
        segmentPlayed = game.turn.segment;
      } else {
        location = "discard";
        segmentDiscarded = game.turn.segment;
        if (action.failed) {
          isMisplayed = true;
        }
      }

      newDeck[order] = {
        ...card,
        suitIndex,
        rank,
        segmentPlayed,
        segmentDiscarded,
        location,
        isMisplayed,
        suitDetermined: card.suitDetermined || identityDetermined,
        rankDetermined: card.rankDetermined || identityDetermined,
        revealedToPlayer: action.suitIndex >= 0 && action.rank >= 0
          ? new Array(6).fill(true) : card.revealedToPlayer,
      };
      break;
    }

    case "draw": {
      // Validate that the client is on the correct turn
      if (
        game.turn.currentPlayerIndex !== action.playerIndex &&
        // Prevent validation during the initial draw; during this phase of the game,
        // the person drawing cards will not necessarily correspond to the person whose turn it is
        game.turn.turnNum > 0
      ) {
        console.warn(
          `The currentPlayerIndex on a draw from the client and the server do not match on turn ${game.turn.turnNum}`,
        );
        console.warn(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `Client = ${game.turn.currentPlayerIndex}, Server = ${action.playerIndex}`,
        );
      }

      const initial = initialCardState(action.order, variant);

      const drawnCard = {
        ...initial,
        location: action.playerIndex,
        suitIndex: nullIfNegative(action.suitIndex),
        rank: nullIfNegative(action.rank),
        segmentDrawn: game.turn.segment,
        revealedToPlayer: drawnCardRevealedToPlayer(action.playerIndex, metadata),
        // The segment will be null during the initial deal
        dealtToStartingHand: game.turn.segment === null,
      };

      newDeck[action.order] = drawnCard;

      break;
    }

    // Some actions do not affect the card state
    case "setEffMod":
    case "editNote":
    case "noteList":
    case "noteListPlayer":
    case "receiveNote":
    case "gameOver":
    case "playerTimes":
    case "strike":
    case "turn": {
      break;
    }

    default: {
      ensureAllCases(action);
      break;
    }
  }

  if (
    game.turn.turnNum === 0
    && action.type === "draw"
    && !deckRules.isInitialDealFinished(newDeck.length, metadata)
  ) {
    // No need to do deduction while cards are being drawn
    return newDeck;
  }

  return cardDeductionReducer(newDeck, action, hands, metadata);
}

// -------
// Helpers
// -------

const cardIdentityRevealedToPlayer = (
  card: CardState,
  metadata: GameMetadata,
) => {
  const revealedToPlayer: boolean[] = [];
  for (let i = 0; i < metadata.characterAssignments.length; i++) {
    if (i !== card.location && getCharacterName(i, metadata) === "Slow-Witted") {
      revealedToPlayer.push(true);
    } else {
      revealedToPlayer.push(card.revealedToPlayer[i]);
    }
  }
  return revealedToPlayer;
};

const drawnCardRevealedToPlayer = (
  drawLocation: number,
  metadata: GameMetadata,
) => {
  const revealedToPlayer: boolean[] = [];
  const numPlayers = metadata.characterAssignments.length;
  for (let playerIndex = 0; playerIndex < numPlayers; playerIndex++) {
    revealedToPlayer.push(canPlayerSeeDrawnCard(playerIndex, drawLocation, numPlayers, metadata));
  }
  return revealedToPlayer;
};

const canPlayerSeeDrawnCard = (
  playerIndex: number,
  drawLocation: number,
  numPlayers: number,
  metadata: GameMetadata,
) => {
  if (playerIndex === drawLocation) {
    return false;
  }
  const characterName = getCharacterName(playerIndex, metadata);
  switch (characterName) {
    case "Slow-Witted": return false;
    case "Oblivious": return drawLocation !== (playerIndex - 1) % numPlayers;
    case "Blind Spot": return drawLocation !== (playerIndex + 1) % numPlayers;
    default: return true;
  }
};

const getCharacterName = (
  playerIndex: number,
  metadata: GameMetadata,
) => {
  const characterID = getCharacterIDForPlayer(
    playerIndex,
    metadata.characterAssignments,
  );
  let characterName = "";
  if (characterID !== null) {
    const giverCharacter = getCharacter(characterID);
    characterName = giverCharacter.name;
  }
  return characterName;
};

function getCard(deck: readonly CardState[], order: number) {
  const card = deck[order];
  if (card === undefined) {
    throw new Error(`Failed to get the card for index: ${order}`);
  }
  return card;
}

function revealCard(
  suitIndex: number | null,
  rank: number | null,
  card: CardState,
) {
  // The action from the server did not specify the identity of the card, so we cannot reveal it
  // (e.g. we are playing a special variant where cards are not revealed when they are played)
  if (suitIndex === null || rank === null) {
    return false;
  }

  // If the card was already fully-clued,
  // we have already revealed it and updated the possibilities on other cards
  if (card.suitDetermined && card.rankDetermined) {
    return true;
  }

  return true;
}
