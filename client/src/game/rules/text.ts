/* eslint-disable import/prefer-default-export */

import { ensureAllCases } from '../../misc';
import { getVariant, getCharacter } from '../data/gameData';
import { getCharacterIDForPlayer } from '../reducers/reducerHelpers';
import { variantRules, handRules, cluesRules } from '../rules';
import { ActionClue } from '../types/actions';
import ClueType from '../types/ClueType';
import EndCondition from '../types/EndCondition';
import GameMetadata from '../types/GameMetadata';

export function getClue(action: ActionClue, targetHand: number[], metadata: GameMetadata) {
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
    const slotsText = slots.join('/');

    return `${giver} ${actionName} at ${target} ${slotsText}'`;
  }

  // Handle the default case of a normal clue
  let clueName = cluesRules.getClueName(action.clue.type, action.clue.value, variant, characterID);
  if (action.list.length !== 1) {
    clueName += 's';
  }

  return `${giver} tells ${target} about ${word} ${clueName}`;
}

export function getGameOver(
  endCondition: EndCondition,
  playerIndex: number,
  score: number,
  metadata: GameMetadata,
) {
  let playerName = 'Hanabi Live';
  if (playerIndex >= 0) {
    playerName = metadata.playerNames[playerIndex];
  }

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

    default: {
      ensureAllCases(endCondition);
      break;
    }
  }

  return 'Players lose!';
}
