import charactersJSON from "./json/characters.json";
import { Character } from "./types/Character";

export function charactersInit(): ReadonlyMap<number, Character> {
  const characters = new Map<number, Character>();

  const charactersJSONArray = Array.from(charactersJSON);
  if (charactersJSONArray.length === 0) {
    throw new Error(
      'The "characters.json" file did not have any elements in it.',
    );
  }

  for (const character of charactersJSONArray) {
    // Validate the name
    if (character.name === "") {
      throw new Error(
        'There is a character with an empty name in the "characters.json" file.',
      );
    }

    // Validate the ID. (The first character has an ID of 0.)
    if (character.id < 0) {
      throw new Error(`The "${character.name}" character has an invalid ID.`);
    }

    // Validate the description
    if (character.description === "") {
      throw new Error(
        `The "${character.name}" character does not have a description.`,
      );
    }

    // Validate the emoji
    if (character.emoji === "") {
      throw new Error(
        `The "${character.name}" character does not have an emoji.`,
      );
    }

    // Add it to the map.
    characters.set(character.id, character);
  }

  return characters;
}
