import type { Character } from "./interfaces/Character";
import charactersJSON from "./json/characters.json";

export function charactersInit(): ReadonlyMap<number, Character> {
  // A test validates the file against the server's catalog contract.
  const characters = charactersJSON as readonly Character[];
  return new Map(characters.map((character) => [character.id, character]));
}
