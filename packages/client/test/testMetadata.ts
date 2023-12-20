import type { GameMetadata, NumPlayers } from "@hanabi/game";
import {
  DEFAULT_PLAYER_NAMES,
  DEFAULT_VARIANT_NAME,
  Options,
  getCardsPerHand,
  getEndGameLength,
  getMinEfficiency,
  getVariant,
  isHardVariant,
} from "@hanabi/game";
import type { Tuple } from "isaacscript-common-ts";
import { newArray } from "isaacscript-common-ts";

export function testMetadata(
  numPlayers: NumPlayers,
  variantName: string = DEFAULT_VARIANT_NAME,
): GameMetadata {
  const options = {
    ...new Options(),
    numPlayers,
    variantName,
  };
  const playerNames = DEFAULT_PLAYER_NAMES.slice(0, numPlayers) as Tuple<
    string,
    NumPlayers
  >;
  const characterAssignments = newArray(numPlayers, null) as Tuple<
    number | null,
    NumPlayers
  >;
  const characterMetadata = newArray(numPlayers, -1) as Tuple<
    number,
    NumPlayers
  >;
  const variant = getVariant(variantName);
  const endGameLength = getEndGameLength(options, characterAssignments);
  const cardsPerHand = getCardsPerHand(options);
  const minEfficiency = getMinEfficiency(
    numPlayers,
    endGameLength,
    variant,
    cardsPerHand,
  );
  const hardVariant = isHardVariant(variant, minEfficiency);

  return {
    ourUsername: "Alice",
    options,
    playerNames,
    ourPlayerIndex: 0,
    characterAssignments,
    characterMetadata,

    minEfficiency,
    hardVariant,

    hasCustomSeed: false,
    seed: "",
  };
}
