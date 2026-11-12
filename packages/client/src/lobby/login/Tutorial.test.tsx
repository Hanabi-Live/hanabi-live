// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { FADE_TIME_MS } from "../../constants.ts";
import { Tutorial } from "./Tutorial.tsx";

vi.mock("../login.ts", () => ({ hide: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function answer(id: string) {
  act(() => {
    document.querySelector<HTMLElement>(`#tutorial-${id}`)!.click();
  });
  act(() => {
    vi.advanceTimersByTime(FADE_TIME_MS);
  });
}

test("people who know the rules hear that the website assumes it", () => {
  vi.useFakeTimers();
  render(<Tutorial />);
  answer("yes");
  answer("2-yes");
  expect(
    screen.getByText(
      "Good, because the website assumes that you already know how to play.",
    ),
  ).toBeTruthy();

  answer("2-1-ok");
  expect(document.querySelector("#tutorial-3")).not.toBeNull();
});
