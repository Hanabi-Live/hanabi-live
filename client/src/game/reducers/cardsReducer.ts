// Calculates the state of the deck after an action

import produce, { castDraft, Draft } from 'immer';
import { ensureAllCases, nullIfNegative } from '../../misc';
import { getVariant } from '../data/gameData';
import { removePossibilities, checkAllPipPossibilities } from '../rules/applyClueCore';
import { GameAction } from '../types/actions';
import CardState from '../types/CardState';
import { colorClue, rankClue } from '../types/Clue';
import ClueType from '../types/ClueType';
import GameMetadata from '../types/GameMetadata';
import GameState from '../types/GameState';
import Variant from '../types/Variant';
import cardPossibilitiesReducer from './cardPossibilitiesReducer';
import initialCardState from './initialStates/initialCardState';

const cardsReducer = produce((
  deck: Draft<CardState[]>,
  action: GameAction,
  game: GameState,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);

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

        const card = getCard(deck, order);
        const wasKnown = (
          card.rankClueMemory.possibilities.length === 1
          && card.colorClueMemory.possibilities.length === 1
        );

        const newCard = cardPossibilitiesReducer(card, clue, positive, metadata);
        deck[order] = newCard;

        if (
          !wasKnown
          && newCard.rankClueMemory.possibilities.length === 1
          && newCard.colorClueMemory.possibilities.length === 1
        ) {
          // If we're currently playing this game and we got clued, this is the first time
          // we identify this card, from the point of view of all hands
          const handsSeeingCardForFirstTime = (metadata.playerSeat === card.holder!)
            ? game.hands // All hands
            : [game.hands[card.holder!]]; // Just the person who's seeing this for the first time
          for (const hand of handsSeeingCardForFirstTime) {
            removePossibilityOnHand(deck, hand, newCard, variant);
          }
        }
      };

      // Positive clues
      action.list.forEach((order) => {
        const card = getCard(deck, order);
        card.numPositiveClues += 1;
        card.turnsClued.push(game.turn);
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
      const card = getCard(deck, action.which.order);

      // Reveal all cards played and discarded
      card.suitIndex = nullIfNegative(action.which.suitIndex);
      card.rank = nullIfNegative(action.which.rank);

      // If the card was already fully-clued,
      // we already updated the possibilities for it on other cards
      if (card.suitIndex != null && card.rank != null && !card.identityDetermined) {
        card.identityDetermined = true;
        // If we're currently playing this game, this is the first time
        // we see this card, from the point of view of all hands
        const handsSeeingCardForFirstTime = (metadata.playerSeat === card.holder!)
          ? game.hands // All hands
          : [game.hands[card.holder!]]; // Just the person who's seeing this for the first time
        for (const hand of handsSeeingCardForFirstTime) {
          removePossibilityOnHand(deck, hand, card, variant);
        }
      }

      card.holder = null;
      if (action.type === 'play') {
        card.turnPlayed = game.turn;
        card.isPlayed = true;
      } else {
        card.turnDiscarded = game.turn;
        card.isDiscarded = true;
        if (action.failed) {
          card.isMisplayed = true;
        }
      }
      break;
    }

    // A player just drew a card from the deck
    // {order: 0, rank: 1, suitIndex: 4, type: "draw", who: 0}
    case 'draw': {
      // TEMP: At this point, check that the local state matches the server
      if (game.currentPlayerIndex !== action.who && game.turn > 0) {
        // NOTE: don't check this during the initial draw
        console.warn('The currentPlayerIndex on a draw from the client and the server do not match. '
            + `Client = ${game.currentPlayerIndex}, Server = ${action.who}`);
      }

      const drawnCard = castDraft({
        ...initialCardState(action.order, variant),
        holder: action.who,
        suitIndex: nullIfNegative(action.suitIndex),
        rank: nullIfNegative(action.rank),
        turnDrawn: game.turn,
      });

      // Remove all possibilities of all cards previously drawn and visible

      const possibilitiesToRemove = deck.slice(0, action.order)
        .filter((card) => card.suitIndex !== null && card.rank !== null)
        .filter((card) => card.holder !== drawnCard.holder
        || (
          card.colorClueMemory.possibilities.length === 1
          && card.rankClueMemory.possibilities.length === 1
        ))
        .map((card) => ({ suitIndex: card.suitIndex!, rank: card.rank!, all: false }));

      const possibleCards = removePossibilities(drawnCard.possibleCards, possibilitiesToRemove);
      const pipPossibilities = checkAllPipPossibilities(possibleCards, variant);

      const suitPipStates = drawnCard.colorClueMemory.pipStates.map(
        (pipState, suitIndex) => (!pipPossibilities.suitsPossible[suitIndex] && pipState !== 'Hidden' ? 'Eliminated' : pipState),
      );

      const rankPipStates = drawnCard.rankClueMemory.pipStates.map(
        (pipState, rank) => (!pipPossibilities.ranksPossible[rank] && pipState !== 'Hidden' ? 'Eliminated' : pipState),
      );

      drawnCard.colorClueMemory.pipStates = suitPipStates;
      drawnCard.rankClueMemory.pipStates = rankPipStates;
      drawnCard.possibleCards = possibleCards;

      deck[action.order] = drawnCard;

      // If the card was drawn by a player we can see, update possibilities
      // on all hands, except for the player that didn't see it
      if (drawnCard.suitIndex != null && drawnCard.rank != null) {
        for (const hand of game.hands.filter((_, i) => i !== drawnCard.holder)) {
          removePossibilityOnHand(deck, hand, drawnCard, variant);
        }
      }

      break;
    }

    case 'strike':
    case 'turn':
    case 'text':
    case 'status':
    case 'stackDirections':
    case 'reorder':
    case 'deckOrder': {
      // Actions that don't affect the card state
      break;
    }

    default: {
      ensureAllCases(action);
      break;
    }
  }
}, {} as CardState[]);

export default cardsReducer;

// -------
// Helpers
// -------

function removePossibilityOnHand(
  deck: Draft<CardState[]>,
  hand: readonly number[],
  card: CardState,
  variant: Variant,
) {
  const cardsExceptCardBeingRemoved = hand
    .filter((order) => order !== card.order)
    .map((order) => deck[order]);

  for (const handCard of cardsExceptCardBeingRemoved) {
    removePossibility(handCard, card.suitIndex!, card.rank!, false, variant);
  }
}

function removePossibility(
  state: Draft<CardState>,
  suitIndex: number,
  rank: number,
  all: boolean,
  variant: Variant,
) {
  // Every card has a possibility map that maps card identities to count
  let cardsLeft = state.possibleCards[suitIndex][rank];
  if (cardsLeft === undefined) {
    throw new Error(`Failed to get an entry for Suit: ${suitIndex} and Rank: ${rank} from the "possibleCards" map for card.`);
  }
  if (cardsLeft > 0) {
    // Remove one or all possibilities for this card,
    // (depending on whether the card was clued
    // or if we saw someone draw a copy of this card)
    cardsLeft = all ? 0 : cardsLeft - 1;
  }

  state.possibleCards[suitIndex][rank] = cardsLeft;

  // Check to see if we can put an X over this suit pip or this rank pip
  const suitPossible = variant.ranks.some((r) => state.possibleCards[suitIndex][r] > 0);

  if (!suitPossible && state.colorClueMemory.pipStates[suitIndex] !== 'Hidden') {
    state.colorClueMemory.pipStates[suitIndex] = 'Eliminated';
  }

  const rankPossible = variant.suits.some((_, i) => state.possibleCards[i][rank] > 0);

  if (!rankPossible && state.rankClueMemory.pipStates[rank] !== 'Hidden') {
    state.rankClueMemory.pipStates[rank] = 'Eliminated';
  }
}

function getCard(deck: Draft<CardState[]>, order: number) {
  const card = deck[order];
  if (!card) {
    console.error(`Failed to get the card for index ${order}.`);
  }
  return card;
}
