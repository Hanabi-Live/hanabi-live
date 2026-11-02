import type { Character, Rank, SuitIndex, Variant } from "@hanabi-live/game";
import {
  getCharacters,
  getNumCopiesOfCard,
  suitIndex,
} from "@hanabi-live/game";
import { assertDefined } from "complete-common";
import { GoRandom, seedToInt64 } from "./goRandom";

export interface DeckCard {
  readonly suitIndex: SuitIndex;
  readonly rank: Rank;
}

export interface AssignedCharacter {
  readonly name: string;
  readonly metadata: number;
}

const DEBUG_PLAYERS: ReadonlySet<string> = new Set([
  "test",
  "test1",
  "test2",
  "test3",
  "test4",
  "test5",
  "test6",
  "test7",
]);
const CHARACTERS = getCharacters();

export function createShuffledDeck(
  variant: Variant,
  seed: string,
): readonly DeckCard[] {
  const deck: DeckCard[] = [];
  for (const [index, suit] of variant.suits.entries()) {
    const color = suitIndex.parse(index);
    for (const rank of variant.ranks) {
      const count = getNumCopiesOfCard(suit, rank, variant);
      for (let copy = 0; copy < count; copy++) {
        deck.push({ suitIndex: color, rank });
      }
    }
  }
  const rng = new GoRandom(seedToInt64(seed));
  // Go shuffles forwards and consumes a draw even for the first card.
  for (let index = 0; index < deck.length; index++) {
    const other = rng.intn(index + 1);
    const first = deck[index];
    const second = deck[other];
    assertDefined(first, "Missing shuffle card.");
    assertDefined(second, "Missing shuffle card.");
    deck[index] = second;
    deck[other] = first;
  }
  return deck;
}

export function assignCharacters(
  variant: Variant,
  seed: string,
  players: readonly string[],
): readonly AssignedCharacter[] {
  if (players.length < 2 || players.length > 6) {
    throw new RangeError("Character assignments require two to six players.");
  }
  // Character selection starts a separate stream, not the shuffled deck's stream.
  const rng = new GoRandom(seedToInt64(seed));
  const assigned: AssignedCharacter[] = [];
  for (const [index, player] of players.entries()) {
    if (DEBUG_PLAYERS.has(player)) {
      assigned.push({ name: index === 0 ? "Genius" : "n/a", metadata: -1 });
      continue;
    }
    let character: Character;
    for (;;) {
      const candidate = CHARACTERS[rng.intn(CHARACTERS.length)];
      assertDefined(candidate, "Missing character catalog entry.");
      if (
        (players.length !== 2 || candidate.not2P !== true)
        && assigned.every((previous) => previous.name !== candidate.name)
      ) {
        character = candidate;
        break;
      }
    }
    let metadata = -1;
    if (character.name === "Fuming" || character.name === "Inept") {
      metadata = rng.intn(variant.clueColors.length);
    } else if (
      character.name === "Dumbfounded"
      || character.name === "Awkward"
    ) {
      metadata = rng.intn(4) + 1;
    }
    assigned.push({ name: character.name, metadata });
  }
  return assigned;
}
