import type { CardOrder } from "@hanabi-live/game";
import { getDefaultVariant } from "@hanabi-live/game";
import { describe, expect, test } from "vitest";
import { getEmpathyNote } from "./empathyNote.ts";
import { parseNote } from "./reducers/notesReducer.ts";
import type { State } from "./types/State.ts";

const VARIANT = getDefaultVariant();
const ORDER = 0 as CardOrder;

function makeState(playing: boolean): State {
  return {
    playing,
    shadowing: false,
    metadata: { playerNames: ["Alice", "Bob"] },
    visibleState: { deck: [{ location: 1 }] },
    notes: {
      ourNotes: [parseNote(VARIANT, "r1")],
      allNotes: [
        [
          { username: "Alice", text: "b5", spectator: false },
          { username: "Bob", text: "g2", spectator: false },
          { username: "Carol", text: "y3", spectator: true },
        ],
      ],
    },
  } as unknown as State;
}

describe("getEmpathyNote", () => {
  test("uses our note when we play", () => {
    expect(getEmpathyNote(makeState(true), VARIANT, ORDER).text).toBe("r1");
  });

  test("uses the note of the card's holder when we do not play", () => {
    expect(getEmpathyNote(makeState(false), VARIANT, ORDER).text).toBe("g2");
  });
});
