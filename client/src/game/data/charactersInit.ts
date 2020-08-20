import charactersJSON from '../../../../data/characters.json';
import Character from '../types/Character';

export default function charactersInit() {
  const CHARACTERS = new Map<number, Character>();

  for (const character of charactersJSON as Character[]) {
    // Validate the name
    if (character.name === '') {
      throw new Error('There is a character with an empty name in the "characters.json" file.');
    }

    // Validate the ID
    if (character.id < 0) { // The first character has an ID of 0
      throw new Error(`The "${character.name}" character has an invalid ID.`);
    }

    // Validate the description
    if (character.description === '') {
      throw new Error(`The "${character.name}" character does not have a description.`);
    }

    // Validate the emoji
    if (character.emoji === '') {
      throw new Error(`The "${character.name}" character does not have an emoji.`);
    }

    // Add it to the map
    CHARACTERS.set(character.id, character);
  }

  return CHARACTERS;
}
