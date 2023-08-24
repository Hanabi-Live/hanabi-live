/* eslint-disable @typescript-eslint/no-restricted-imports */

import type { NumPlayers } from "@hanabi/data";
import { DEFAULT_VARIANT_NAME, getVariant } from "@hanabi/data";
import type { Tuple } from "@hanabi/utils";
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
  const playerNames = [
    "Alice",
    "Bob",
    "Cathy",
    "Donald",
    "Emily",
    "Frank",
  ].slice(0, numPlayers) as Tuple<string, NumPlayers>;
  const characterAssignments = newArray(numPlayers, null) as Tuple<
    number | null,
    NumPlayers
  >;
  const characterMetadata = newArray(numPlayers, -1) as Tuple<
    number,
    NumPlayers
  >;
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
    playerNames,
    ourPlayerIndex: 0,
    characterAssignments,
    characterMetadata,

    minEfficiency,
    hardVariant: minEfficiency >= HARD_VARIANT_EFFICIENCY_THRESHOLD,

    hasCustomSeed: false,
    seed: "",
  };
}
