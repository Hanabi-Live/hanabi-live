import { HISTORY_HASH } from "../constants";

/** The lobby address hash of the other scores of a seed, before the encoded seed. */
const HISTORY_OTHER_SCORES_HASH_PREFIX = `${HISTORY_HASH}-other-scores-`;

/** Returns the lobby address hash of a seed's other scores. */
export function getOtherScoresHash(seed: string): string {
  return `${HISTORY_OTHER_SCORES_HASH_PREFIX}${encodeURIComponent(seed)}`;
}

/** Returns the seed in the address hash of a seed's other scores, if it is one. */
export function getOtherScoresSeed(hash: string): string | undefined {
  if (!hash.startsWith(HISTORY_OTHER_SCORES_HASH_PREFIX)) {
    return undefined;
  }
  const encodedSeed = hash.slice(HISTORY_OTHER_SCORES_HASH_PREFIX.length);
  return encodedSeed === "" ? undefined : decodeURIComponent(encodedSeed);
}
