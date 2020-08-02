import { ensureAllCases } from '../../misc';
import { getVariant, getCharacter } from '../data/gameData';
import { getCharacterIDForPlayer } from '../reducers/reducerHelpers';
import {
  cardRules,
  cluesRules,
  handRules,
  variantRules,
} from '../rules';
import { ActionClue, ActionDiscard, ActionPlay } from '../types/actions';
import ClueType from '../types/ClueType';
import EndCondition from '../types/EndCondition';
import GameMetadata, { getPlayerName } from '../types/GameMetadata';

export const clue = (action: ActionClue, targetHand: number[], metadata: GameMetadata) => {
  const giver = metadata.playerNames[action.giver];
  let target = metadata.playerNames[action.target];
  const words = [
    'zero',
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
  ];
  const word = words[action.list.length];
  const variant = getVariant(metadata.options.variantName);

  // First, handle the case of clue text in some special variants
  const characterID = getCharacterIDForPlayer(action.giver, metadata.characterAssignments);
  let characterName = '';
  if (characterID !== null) {
    const character = getCharacter(characterID);
    characterName = character.name;
  }
  if (
    variantRules.isCowAndPig(variant)
    || variantRules.isDuck(variant)
    || characterName === 'Quacker'
  ) {
    let actionName = 'clues';
    if (variantRules.isCowAndPig(variant)) {
      if (action.clue.type === ClueType.Color) {
        actionName = 'moos';
      } else if (action.clue.type === ClueType.Rank) {
        actionName = 'oinks';
      }
    } else if (variantRules.isDuck(variant) || characterName === 'Quacker') {
      actionName = 'quacks';
    }

    target += '\'';
    if (!target.endsWith('s')) {
      target += 's';
    }

    // Create a list of slot numbers that correspond to the cards touched
    const slots: number[] = [];
    for (const order of action.list) {
      const slot = handRules.cardSlot(order, targetHand);
      if (slot === null) {
        throw new Error(`Failed to get the slot for card ${order}.`);
      }
      slots.push(slot);
    }
    slots.sort();

    let slotWord = 'slot';
    if (slots.length !== 1) {
      slotWord += 's';
    }

    const slotsText = slots.join('/');

    return `${giver} ${actionName} at ${target} ${slotWord} ${slotsText}`;
  }

  // Handle the default case of a normal clue
  let clueName = cluesRules.getClueName(action.clue.type, action.clue.value, variant, characterID);
  if (action.list.length !== 1) {
    clueName += 's';
  }

  return `${giver} tells ${target} about ${word} ${clueName}`;
};

export const gameOver = (
  endCondition: EndCondition,
  playerIndex: number,
  score: number,
  metadata: GameMetadata,
) => {
  const playerName = getPlayerName(playerIndex, metadata);

  switch (endCondition) {
    case EndCondition.InProgress:
    case EndCondition.Normal: {
      return `Players score ${score} points.`;
    }

    case EndCondition.Strikeout: {
      break;
    }

    case EndCondition.Timeout: {
      return `${playerName} ran out of time!`;
    }

    case EndCondition.Terminated: {
      return `${playerName} terminated the game!`;
    }

    case EndCondition.SpeedrunFail: {
      break;
    }

    case EndCondition.IdleTimeout: {
      return 'Players were idle for too long.';
    }

    case EndCondition.CharacterSoftlock: {
      return `${playerName} was left with 0 clues!`;
    }

    case EndCondition.AllOrNothingFail: {
      break;
    }

    case EndCondition.AllOrNothingSoftlock: {
      return `${playerName} was left with 0 clues and 0 cards!`;
    }

    default: {
      ensureAllCases(endCondition);
      break;
    }
  }

  return 'Players lose!';
};

export const play = (
  action: ActionPlay,
  slot: number | null,
  touched: boolean,
  playing: boolean,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);
  const playerName = getPlayerName(action.playerIndex, metadata);

  let card;
  if (variantRules.isThrowItInAHole(variant) && playing) {
    card = 'a card';
  } else {
    card = cardRules.name(action.suitIndex, action.rank, variant);
  }

  let location;
  if (slot === null) {
    location = 'the deck';
  } else {
    location = `slot #${slot}`;
  }

  let suffix = '';
  if (!touched) {
    suffix = ' (blind)';
  }

  return `${playerName} plays ${card} from ${location}${suffix}`;
};

export const discard = (
  action: ActionDiscard,
  slot: number | null,
  touched: boolean,
  playing: boolean,
  metadata: GameMetadata,
) => {
  const variant = getVariant(metadata.options.variantName);
  const playerName = getPlayerName(action.playerIndex, metadata);

  let verb = 'discards';
  if (action.failed) {
    verb = 'fails to play';
    if (variantRules.isThrowItInAHole(variant) && playing) {
      verb = 'plays';
    }
  }

  let card = '';
  if (action.suitIndex === -1 || action.rank === -1) {
    card = 'a card';
  } else {
    card = cardRules.name(action.suitIndex, action.rank, variant);
  }

  let location;
  if (slot === null) {
    location = 'the deck';
  } else {
    location = `slot #${slot}`;
  }

  let suffix = '';
  if (action.failed && touched) {
    suffix = ' (clued)';
  }
  if (action.failed && slot !== null && !touched) {
    suffix = ' (blind)';
  }

  return `${playerName} ${verb} ${card} from ${location}${suffix}`;
};
