import { describe, expect, test } from "@jest/globals";
import { createStore } from "redux";
import { observeStore } from "./observeStore";

function stepReducer(
  state: { step: number } | undefined,
  action: { type: string; step?: number },
) {
  const current = state ?? { step: 0 };
  return action.type === "advance" ? { step: action.step ?? 0 } : current;
}

function counterReducer(
  state: { count: number; label: string } | undefined,
  action: { type: string },
) {
  const current = state ?? { count: 0, label: "original" };
  return action.type === "advance"
    ? { ...current, count: current.count + 1 }
    : current;
}

describe("observeStore", () => {
  test("applies nested dispatch updates in order without reverting the UI", () => {
    const store = createStore(stepReducer);
    const rendered: number[] = [];

    const unsubscribe = observeStore(store, [
      {
        select: (state) => state.step,
        onChange: (step) => {
          // A callback may trigger a synchronous Redux dispatch.
          if (step === 1) {
            store.dispatch({ type: "advance", step: 2 });
          }
        },
      },
      {
        select: (state) => state.step,
        onChange: (step) => {
          rendered.push(step);
        },
      },
    ]);

    store.dispatch({ type: "advance", step: 1 });

    expect(store.getState().step).toBe(2);
    expect(rendered).toEqual([0, 1, 2]);

    unsubscribe();
  });

  test("skips unchanged selectors", () => {
    const store = createStore(counterReducer);
    const updates: string[] = [];

    const unsubscribe = observeStore(store, [
      {
        select: (state) => state.label,
        onChange: (label) => {
          updates.push(label);
        },
      },
    ]);

    store.dispatch({ type: "advance" });

    expect(updates).toEqual(["original"]);
    unsubscribe();
  });
});
