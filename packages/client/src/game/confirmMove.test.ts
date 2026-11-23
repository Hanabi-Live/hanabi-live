import type { SuitRankTuple } from "@hanabi-live/game";
import { CardStatus, StackDirection, getVariant } from "@hanabi-live/game";
import { beforeEach, describe, expect, test, vi } from "vitest";

const askForConfirmation = vi.fn();

const globals: { state?: unknown; variant?: unknown } = {};
vi.mock("./gameSession.ts", () => ({
  currentState: () => globals.state,
  currentVariant: () => globals.variant,
}));
vi.mock("../modals.ts", () => ({ askForConfirmation }));
const { confirmPlay, confirmDiscard } = await import("./confirmMove.ts");

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
      metadata: {
        ourPlayerIndex: 0,
        options: {
          speedrun: false,
        },
      },
      replay: {
        hypothetical: undefined,
      },
      notes: {
        ourNotes: [{ possibilities }],
      },
      ongoingGame: {
        turn: {
          currentPlayerIndex: 0,
        },
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
    {
      order: 0,
      possibleCards,
    } as unknown as Parameters<typeof confirmPlay>[0],
    play,
  );
  return play;
}

describe("confirmPlay with an identity note", () => {
  beforeEach(() => {
    askForConfirmation.mockClear();
    globals.variant = getVariant("No Variant");
  });

  test("warns when every noted identity is unplayable", () => {
    const play = playWithNote([tuple(BLUE, 2)]);

    expect(askForConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Your note says that this card is not playable.",
        caution: true,
      }),
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

function discard(possibleCards: readonly SuitRankTuple[]) {
  // Only red 5 is critical.
  const cardStatus = Array.from({ length: NUM_SUITS }, (_, suitIndex) =>
    Object.fromEntries(
      [1, 2, 3, 4, 5].map((rank) => [
        rank,
        suitIndex === RED && rank === 5
          ? CardStatus.Critical
          : CardStatus.NeedsToBePlayed,
      ]),
    ),
  );
  Object.assign(globals, {
    state: {
      metadata: {
        options: {
          speedrun: false,
        },
      },
      replay: {
        hypothetical: undefined,
      },
      ongoingGame: {
        cardStatus,
      },
    },
  });
  const send = vi.fn<() => void>();
  confirmDiscard(
    {
      order: 0,
      possibleCards,
    } as unknown as Parameters<typeof confirmDiscard>[0],
    send,
  );
  return send;
}

describe("confirmDiscard", () => {
  beforeEach(() => {
    askForConfirmation.mockClear();
  });

  test("warns when the card is known to be critical", () => {
    const send = discard([tuple(RED, 5)]);

    expect(askForConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "This card is critical.",
        caution: true,
      }),
      send,
      undefined,
    );
    expect(send).not.toHaveBeenCalled();
  });

  test("discards without a warning when the card may not be critical", () => {
    const send = discard([tuple(RED, 5), tuple(BLUE, 5)]);

    expect(askForConfirmation).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalled();
  });
});
