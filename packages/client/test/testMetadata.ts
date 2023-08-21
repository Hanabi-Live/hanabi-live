import type { NumPlayers } from "@hanabi/data";
import { DEFAULT_VARIANT_NAME, getVariant } from "@hanabi/data";
import { newArray } from "@hanabi/utils";
import { HARD_VARIANT_EFFICIENCY_THRESHOLD } from "../src/constants";
import * as handRules from "../src/game/rules/hand";
import * as statsRules from "../src/game/rules/stats";
import * as turnRules from "../src/game/rules/turn";
import type { GameMetadata } from "../src/game/types/GameMetadata";
import { Options } from "../src/types/Options";

export function testMetadata(
  numPlayers: NumPlayers,
  variantName: string = DEFAULT_VARIANT_NAME,
): GameMetadata {
  const options = {
    ...new Options(),
    numPlayers,
    variantName,
  };
  const characterAssignments = newArray(numPlayers, null);
  const variant = getVariant(variantName);
  const minEfficiency = statsRules.minEfficiency(
    numPlayers,
    turnRules.endGameLength(options, characterAssignments),
    variant,
    handRules.cardsPerHand(options),
  );
  return {
    ourUsername: "Alice",
    options,
    playerNames: ["Alice", "Bob", "Cathy", "Donald", "Emily", "Frank"].slice(
      0,
      numPlayers,
    ),
    ourPlayerIndex: 0,
    characterAssignments,
    characterMetadata: [],

    minEfficiency,
    hardVariant: minEfficiency >= HARD_VARIANT_EFFICIENCY_THRESHOLD,

    hasCustomSeed: false,
    seed: "",
  };
}
