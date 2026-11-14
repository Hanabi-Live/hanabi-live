import type { z } from "zod";
import type { cardIdentitySchema } from "./generated/protocol.ts";
import type { CardIdentity } from "./interfaces/CardIdentity.ts";

/** A card's suit and rank, as an event names them. */
export type KnownCardIdentity = z.output<typeof cardIdentitySchema>;

/**
 * The `identity` field of a card event. A card event names a card's identity only when both its
 * suit and its rank are known.
 */
export function identityField(card: CardIdentity): {
  readonly identity?: KnownCardIdentity;
} {
  const { suitIndex, rank } = card;
  return suitIndex === undefined || rank === undefined
    ? {}
    : {
        identity: {
          suitIndex,
          rank,
        },
      };
}
