import type { Character } from "./interfaces/Character.ts";
import charactersJSON from "./json/characters.json" with { type: "json" };

export function charactersInit(): ReadonlyMap<number, Character> {
  // A test validates the file against the server's catalog contract.
  const characters = charactersJSON as readonly Character[];
  return new Map(characters.map((character) => [character.id, character]));
}
