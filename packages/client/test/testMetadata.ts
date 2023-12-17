/* eslint-disable @typescript-eslint/no-restricted-imports */

import type { NumPlayers } from "@hanabi/data";
import {
  DEFAULT_PLAYER_NAMES,
  DEFAULT_VARIANT_NAME,
  getVariant,
} from "@hanabi/data";
import { getCardsPerHand, getEndGameLength, isHardVariant } from "@hanabi/game";
import type { Tuple } from "isaacscript-common-ts";
import { newArray } from "isaacscript-common-ts";
import { Options } from "../../game/src/classes/Options";
import type { GameMetadata } from "../../game/src/interfaces/GameMetadata";
import * as statsRules from "../src/game/rules/stats";

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
  const minEfficiency = statsRules.getMinEfficiency(
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
