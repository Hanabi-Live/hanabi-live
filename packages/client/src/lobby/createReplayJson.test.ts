import type { CardOrder } from "@hanabi-live/game";
import { defaultOptions } from "@hanabi-live/game";
import { expect, test, vi } from "vitest";

vi.mock("../chat.ts", () => ({
  SelfChatMessageType: {},
}));
vi.mock("../game/gameSession.ts", () => ({}));
vi.mock("../store.ts", () => ({}));
const { getReplayOptions, getCardOrderInSlot } =
  await import("./createReplayJson.ts");

test("finds the card of a slot in a full hand and in a short hand", () => {
  const hand = [10, 11, 12, 13] as CardOrder[];
  expect(getCardOrderInSlot(hand, 1)).toBe(13);
  expect(getCardOrderInSlot(hand, 4)).toBe(10);
  // The deck is empty, so the hand has fewer cards than the game deals.
  expect(getCardOrderInSlot(hand.slice(0, 2), 1)).toBe(11);
  expect(getCardOrderInSlot(hand.slice(0, 2), 2)).toBe(10);
});

test("a copied game keeps the options that change how it plays", () => {
  expect(
    getReplayOptions({
      ...defaultOptions,
      oneExtraCard: true,
      allOrNothing: true,
      speedrun: true,
    }),
  ).toStrictEqual({
    variantId: defaultOptions.variantId,
    deckPlays: false,
    emptyClues: false,
    oneExtraCard: true,
    oneLessCard: false,
    allOrNothing: true,
  });
});
