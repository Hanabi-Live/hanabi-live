import type { Tuple } from "complete-common";
import { newArray } from "complete-common";
import { DEFAULT_PLAYER_NAMES } from "./constants.js";
import { getVariant } from "./gameData.js";
import { DEFAULT_VARIANT_NAME } from "./generated/protocol.js";
import type { GameMetadata } from "./interfaces/GameMetadata.js";
import { defaultOptions } from "./interfaces/Options.js";
import { getCardsPerHand } from "./rules/hand.js";
import { getMinEfficiency } from "./rules/stats.js";
import { getEndGameLength } from "./rules/turn.js";
import { isHardVariant } from "./rules/variants/hGroup.js";
import type { NumPlayers } from "./types/NumPlayers.js";

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
    ...defaultOptions,
    numPlayers,
    variantName,
  };
  const playerNames = DEFAULT_PLAYER_NAMES.slice(0, numPlayers) as Tuple<
    string,
    NumPlayers
  >;
  const characterAssignments = newArray(numPlayers, undefined) as Tuple<
    number | undefined,
    NumPlayers
  >;
  const characterMetadata = newArray(numPlayers, undefined) as Tuple<
    number | undefined,
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
    seed: undefined,
  };
}
