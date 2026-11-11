import { afterEach, describe, expect, test, vi } from "vitest";
import type { HanabiCard } from "./HanabiCard.ts";
import { DOUBLE_TAP_DELAY_MILLISECONDS } from "./constants.ts";

vi.mock("./notes.ts", () => ({}));
vi.mock("./replay.ts", () => ({}));
const { HanabiCardTap } = await import("./HanabiCardTouchActions.ts");

afterEach(() => {
  vi.useRealTimers();
});

describe("tapping a card", () => {
  test("the second tap of a double tap is not treated as a long press", () => {
    vi.useFakeTimers();
    const card = {
      wasRecentlyTapped: false,
      touchstartTimeout: undefined,
    } as unknown as HanabiCard;
    const longPress = vi.fn();

    for (let i = 0; i < 2; i++) {
      card.touchstartTimeout = setTimeout(() => {
        longPress();
      }, DOUBLE_TAP_DELAY_MILLISECONDS);
      HanabiCardTap.call(card);
    }
    vi.advanceTimersByTime(DOUBLE_TAP_DELAY_MILLISECONDS);

    expect(longPress).not.toHaveBeenCalled();
  });
});
