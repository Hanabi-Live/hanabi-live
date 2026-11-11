import type { SuitRankTuple } from "@hanabi-live/game";
import { StackDirection, getVariant } from "@hanabi-live/game";
import { beforeEach, describe, expect, test, vi } from "vitest";

const askForConfirmation = vi.fn();

vi.mock("./UiGlobals.ts", () => ({ globals: {} }));
vi.mock("../../modals.ts", () => ({ askForConfirmation }));
const { confirmPlay } = await import("./confirmPlay.ts");
const { globals } = await import("./UiGlobals.ts");

const NUM_SUITS = 5;
const BLUE = 3;
const RED = 0;

const allCards: SuitRankTuple[] = [];
for (let suitIndex = 0; suitIndex < NUM_SUITS; suitIndex++) {
  for (let rank = 1; rank <= 5; rank++) {
    allCards.push([suitIndex, rank] as unknown as SuitRankTuple);
  }
}

function tuple(suitIndex: number, rank: number) {
  return [suitIndex, rank] as unknown as SuitRankTuple;
}

function playWithNote(
  possibilities: readonly SuitRankTuple[],
  possibleCards: readonly SuitRankTuple[] = allCards,
) {
  Object.assign(globals, {
    state: {
      replay: { hypothetical: undefined },
      notes: { ourNotes: [{ possibilities }] },
      ongoingGame: {
        turn: { currentPlayerIndex: 0 },
        strikes: [],
        deck: [],
        playStacks: Array.from({ length: NUM_SUITS }, () => []),
        playStackDirections: Array.from(
          { length: NUM_SUITS },
          () => StackDirection.Up,
        ),
        playStackStarts: Array.from({ length: NUM_SUITS }, () => undefined),
      },
    },
  });
  const play = vi.fn<() => void>();
  confirmPlay(
    { order: 0, possibleCards } as unknown as Parameters<typeof confirmPlay>[0],
    play,
  );
  return play;
}

describe("confirmPlay with an identity note", () => {
  beforeEach(() => {
    askForConfirmation.mockClear();
    Object.assign(globals, {
      metadata: { ourPlayerIndex: 0 },
      options: { speedrun: false },
      variant: getVariant("No Variant"),
    });
  });

  test("warns when every noted identity is unplayable", () => {
    const play = playWithNote([tuple(BLUE, 2)]);

    expect(askForConfirmation).toHaveBeenCalledWith(
      "Play Card Contrary to Note?",
      expect.any(String),
      "Play",
      play,
      undefined,
    );
    expect(play).not.toHaveBeenCalled();
  });

  test.each([
    ["a playable noted identity", [tuple(BLUE, 2), tuple(RED, 1)], allCards],
    ["no noted identity", [], allCards],
    [
      "a note contradicting known information",
      [tuple(BLUE, 2)],
      [tuple(RED, 1), tuple(RED, 2)],
    ],
  ] as const)(
    "plays without a warning for %s",
    (_name, note, possibleCards) => {
      const play = playWithNote(note, possibleCards);

      expect(askForConfirmation).not.toHaveBeenCalled();
      expect(play).toHaveBeenCalled();
    },
  );
});
