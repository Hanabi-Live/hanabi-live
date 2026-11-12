import type { Tuple } from "complete-common";
import { newArray } from "complete-common";
import { DEFAULT_PLAYER_NAMES } from "./constants.ts";
import { getVariant } from "./gameData.ts";
import { DEFAULT_VARIANT_NAME } from "./generated/protocol.ts";
import type { GameMetadata } from "./interfaces/GameMetadata.ts";
import { defaultOptions } from "./interfaces/Options.ts";
import { getCardsPerHand } from "./rules/hand.ts";
import { getMinEfficiency } from "./rules/stats.ts";
import { getEndGameLength } from "./rules/turn.ts";
import { isHardVariant } from "./rules/variants/hGroup.ts";
import type { NumPlayers } from "./types/NumPlayers.ts";

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
  const variant = getVariant(variantName);
  const options = {
    ...defaultOptions,
    numPlayers,
    variantId: variant.id,
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

    customDeal: false,
    seed: undefined,
  };
}
