import { afterEach, describe, expect, test, vi } from "vitest";
import type { HanabiCard } from "./HanabiCard";
import { DOUBLE_TAP_DELAY_MILLISECONDS } from "./constants";

vi.mock("./notes", () => ({}));
vi.mock("./replay", () => ({}));
const { HanabiCardTap } = await import("./HanabiCardTouchActions");

afterEach(() => {
  vi.useRealTimers();
});

describe("tapping a card", () => {
  test("the second tap of a double tap is not treated as a long press", () => {
    vi.useFakeTimers();
    const card = {
      wasRecentlyTapped: false,
      touchstartTimeout: null,
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
