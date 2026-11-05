import {
  DEFAULT_PLAYER_NAMES,
  getVariant,
  options,
  VALID_NUM_PLAYERS,
  VARIANT_NAMES,
} from "@hanabi-live/game";
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Shared test registration, not application code.
import { describe, expect, test } from "@jest/globals";
import { isDeepStrictEqual } from "node:util";
import { createGame } from "./game";
import { createShuffledDeck } from "./setup";
import type { EngineState } from "./types";
import { parseEngineState } from "./types";

export function checkpointRoundTrip(state: EngineState): EngineState {
  const serialized = JSON.stringify(state);
  const raw: unknown = JSON.parse(serialized);
  return parseEngineState(raw);
}

export function variantCheckpointTests(partition: 0 | 1): void {
  describe("checkpoint coverage of the entire variant catalog", () => {
    test.each(VARIANT_NAMES.filter((_, index) => index % 2 === partition))(
      "restores every supported player/hand size in %s",
      (variantName) => {
        const variant = getVariant(variantName);
        for (const count of VALID_NUM_PLAYERS) {
          const seed = `p${count}v${variant.id}s1`;
          const deck = createShuffledDeck(variant, seed);
          const playerNames = DEFAULT_PLAYER_NAMES.slice(0, count);
          for (const handSizeOptions of [
            {},
            { oneExtraCard: true },
            { oneLessCard: true },
          ]) {
            const { state } = createGame({
              options: options.parse({
                variantName,
                numPlayers: count,
                startingPlayer: count - 1,
                detrimentalCharacters: true,
                ...handSizeOptions,
              }),
              seed,
              deck,
              playerNames,
              // Slow-Witted maximizes the initial event count by revealing every second slot.
              characters: playerNames.map((_, index) => ({
                name: index === 0 ? "Slow-Witted" : "n/a",
                metadata: -1,
              })),
            });
            expect(isDeepStrictEqual(checkpointRoundTrip(state), state)).toBe(
              true,
            );
          }
        }
      },
    );
  });
}
