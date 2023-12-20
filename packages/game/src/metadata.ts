/* eslint-disable unicorn/no-null */

import type { Tuple } from "isaacscript-common-ts";
import { newArray } from "isaacscript-common-ts";
import { Options } from "./classes/Options";
import { DEFAULT_PLAYER_NAMES, DEFAULT_VARIANT_NAME } from "./constants";
import { getVariant } from "./gameData";
import type { GameMetadata } from "./interfaces/GameMetadata";
import { getCardsPerHand } from "./rules/hand";
import { getMinEfficiency } from "./rules/stats";
import { getEndGameLength } from "./rules/turn";
import { isHardVariant } from "./rules/variants/hGroup";
import type { NumPlayers } from "./types/NumPlayers";

/**
 * This function is not used by the client, because the corresponding metadata for a game will
 * always come from the server.
 *
 * Thus, this function is useful for tests and bots.
 */
export function getDefaultMetadata(
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
