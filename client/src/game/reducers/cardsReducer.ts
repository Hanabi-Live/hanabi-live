// Calculates the state of the deck after an action

import { ensureAllCases, nullIfNegative } from '../../misc';
import { getVariant } from '../data/gameData';
import { GameAction } from '../types/actions';
import CardState from '../types/CardState';
import { colorClue, rankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import Variant from '../types/Variant';
import cardPossibilitiesReducer, { checkPips } from './cardPossibilitiesReducer';
import initialCardState from './initialStates/initialCardState';

const cardsReducer = (
  deck: readonly CardState[],
  action: GameAction,
  game: GameState,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);
  const newDeck = deck.concat([]);

  switch (action.type) {
    // A player just gave a clue
    // {clue: {type: 0, value: 1}, giver: 1, list: [11], target: 2, turn: 0, type: "clue"}
    case 'clue': {
      const clue = action.clue.type === ClueType.Color
        ? colorClue(variant.clueColors[action.clue.value])
        : rankClue(action.clue.value);

      const applyClue = (order: number, positive: boolean) => {
        // TODO: conditions to applyClue
        /*
          if (
          !globals.lobby.settings.realLifeMode
          && !variantRules.isCowAndPig(globals.variant)
          && !variantRules.isDuck(globals.variant)
          && !(
            globals.characterAssignments[data.giver!] === 'Quacker'
            && card.state.holder === globals.playerUs
            && !globals.replay
          )
        */

        const card = getCard(newDeck, order);
        const wasKnown = (card.matchingCardsArray.length === 1);

        const newCard = cardPossibilitiesReducer(card, clue, positive, metadata);
        newDeck[order] = newCard;

        if (
          !wasKnown
          && newCard.matchingCardsArray.length === 1
        ) {
          // If we're currently playing this game and we got clued, this is the first time
          // we identify this card, from the point of view of all hands
          const handsSeeingCardForFirstTime = (metadata.ourPlayerIndex === card.location)
            ? game.hands // All hands
            : [game.hands[card.location as number]]; // Just who's seeing this for the first time
          for (const hand of handsSeeingCardForFirstTime) {
            removePossibilityOnHand(
              newDeck,
              hand,
              order,
              newCard.suitIndex!,
              newCard.rank!,
              variant,
            );
          }
        }
      };

      // Positive clues
      action.list.forEach((order) => {
        const card = getCard(newDeck, order);
        newDeck[order] = {
          ...getCard(newDeck, order),
          numPositiveClues: card.numPositiveClues + 1,
          turnsClued: [...card.turnsClued, game.turn.turnNum],
        };
        applyClue(order, true);
      });

      // Negative clues
      game.hands[action.target]
        .filter((order) => !action.list.includes(order))
        .forEach((order) => applyClue(order, false));
      break;
    }

    case 'discard':
    case 'play': {
      const order = action.order;
      const card = getCard(deck, order);

      // Reveal all cards played and discarded
      const suitIndex = nullIfNegative(action.suitIndex);
      const rank = nullIfNegative(action.rank);

      let identityDetermined = card.identityDetermined;

      // If the card was already fully-clued,
      // we already updated the possibilities for it on other cards
      if (suitIndex !== null && rank !== null && !identityDetermined) {
        identityDetermined = true;
        // If we're currently playing this game, this is the first time
        // we see this card, from the point of view of all hands
        const handsSeeingCardForFirstTime = (metadata.ourPlayerIndex === card.location)
          ? game.hands // All hands
          : [game.hands[card.location as number]]; // Just who's seeing this for the first time
        for (const hand of handsSeeingCardForFirstTime) {
          removePossibilityOnHand(newDeck, hand, order, suitIndex, rank, variant);
        }
      }

      let turnPlayed = card.turnPlayed;
      let turnDiscarded = card.turnDiscarded;
      let location = card.location;
      let isMisplayed = card.isMisplayed;

      if (action.type === 'play') {
        turnPlayed = game.turn.turnNum;
        location = 'playStack';
      } else {
        turnDiscarded = game.turn.turnNum;
        location = 'discard';
        if (action.failed) {
          isMisplayed = true;
        }
      }

      newDeck[order] = {
        ...card,
        suitIndex,
        rank,
        identityDetermined,
        turnPlayed,
        turnDiscarded,
        location,
        isMisplayed,
      };
      break;
    }

    // A player just drew a card from the deck
    // {order: 0, rank: 1, suitIndex: 4, type: "draw", who: 0}
    case 'draw': {
      // TEMP: At this point, check that the local state matches the server
      if (game.turn.currentPlayerIndex !== action.who && game.turn.turnNum > 0) {
        // NOTE: don't check this during the initial draw
        console.warn(`The currentPlayerIndex on a draw from the client and the server do not match on turn ${game.turn}`);
        console.warn(`Client = ${game.turn.currentPlayerIndex}, Server = ${action.who}`);
      }

      const initial = initialCardState(action.order, variant);
      const unseenCards = Array.from(initial.unseenCards, (arr) => Array.from(arr));
      // Remove all possibilities of all cards previously drawn and visible
      deck.slice(0, action.order)
        .filter((card) => card.suitIndex !== null && card.rank !== null)
        .filter((card) => card.location !== action.who || card.matchingCardsArray.length === 1)
        .forEach((card) => { unseenCards[card.suitIndex!][card.rank!] -= 1; });

      const { suitPips, rankPips } = checkPips(initial.matchingCardsArray, unseenCards, variant);

      const drawnCard = {
        ...initial,
        location: action.who,
        suitIndex: nullIfNegative(action.suitIndex),
        rank: nullIfNegative(action.rank),
        turnDrawn: game.turn.turnNum,
        colorClueMemory: {
          ...initial.colorClueMemory,
          pipStates: suitPips,
        },
        rankClueMemory: {
          ...initial.rankClueMemory,
          pipStates: rankPips,
        },
        unseenCards,
      };

      newDeck[action.order] = drawnCard;

      // If the card was drawn by a player we can see, update possibilities
      // on all hands, except for the player that didn't see it
      if (drawnCard.suitIndex != null && drawnCard.rank != null) {
        for (const hand of game.hands.filter((_, i) => i !== drawnCard.location)) {
          removePossibilityOnHand(
            newDeck,
            hand,
            action.order,
            drawnCard.suitIndex!,
            drawnCard.rank!,
            variant,
          );
        }
      }

      break;
    }

    case 'gameOver':
    case 'strike':
    case 'turn':
    case 'text':
    case 'status':
    case 'stackDirections':
    case 'reorder': {
      // Actions that don't affect the card state
      break;
    }

    default: {
      ensureAllCases(action);
      break;
    }
  }
  return newDeck;
};

export default cardsReducer;

// -------
// Helpers
// -------

function removePossibilityOnHand(
  deck: CardState[],
  hand: readonly number[],
  order: number,
  suitIndex: number,
  rank: number,
  variant: Variant,
) {
  const cardsExceptCardBeingRemoved = hand
    .filter((o) => o !== order)
    .map((o) => deck[o]);

  for (const handCard of cardsExceptCardBeingRemoved) {
    const newCard = removePossibility(handCard, suitIndex, rank, variant);
    deck[handCard.order] = newCard;
  }
}

function removePossibility(
  state: CardState,
  suitIndex: number,
  rank: number,
  variant: Variant,
) {
  // Every card has a possibility map that maps card identities to count
  const unseenCards = Array.from(state.unseenCards, (arr) => Array.from(arr));
  const cardsLeft = unseenCards[suitIndex][rank];
  if (cardsLeft === undefined) {
    throw new Error(`Failed to get an entry for Suit: ${suitIndex} and Rank: ${rank} from the "unseenCards" map for card.`);
  }

  unseenCards[suitIndex][rank] = cardsLeft - 1;

  // Check to see if we can put an X over this suit pip or this rank pip
  const { suitPips, rankPips } = checkPips(state.matchingCardsArray, unseenCards, variant);

  return {
    ...state,
    unseenCards,
    colorClueMemory: {
      ...state.colorClueMemory,
      pipStates: suitPips,
    },
    rankClueMemory: {
      ...state.rankClueMemory,
      pipStates: rankPips,
    },
  };
}

function getCard(deck: readonly CardState[], order: number) {
  const card = deck[order];
  if (card === undefined) {
    console.error(`Failed to get the card for index ${order}.`);
  }
  return card;
}
