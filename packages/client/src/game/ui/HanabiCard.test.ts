import { describe, expect, test, vi } from "vitest";

vi.mock("./UiGlobals.ts", () => ({
  globals: {
    activeHover: undefined,
  },
}));
vi.mock("../../tooltips.ts", () => ({}));
vi.mock("../../Globals.ts", () => ({
  globals: {},
}));
vi.mock("./noteCheckImpossibility.ts", () => ({
  checkNoteImpossibility: vi.fn(),
  possibleCardsFromNoteAndClues: vi.fn(),
}));
vi.mock("./HanabiCardMouse.ts", () => ({
  registerMouseHandlers: vi.fn(),
  setCursor: vi.fn(),
  setEmpathyOnHand: vi.fn(),
}));
vi.mock("./notes.ts", () => ({}));
vi.mock("./LayoutChild.ts", () => ({ LayoutChild: vi.fn() }));
const { HanabiCard } = await import("./HanabiCard.ts");
const { globals } = await import("./UiGlobals.ts");

describe("removeLayoutChildFromParent", () => {
  test("releases a card that is held while it leaves the hand", () => {
    const calls: string[] = [];
    const layout = {
      parent: null,
      x: () => 1,
      y: () => 1,
      off: vi.fn((event: string) => {
        calls.push(`off ${event}`);
      }),
      draggable: vi.fn((value: boolean) => {
        calls.push(`draggable ${value}`);
      }),
    };
    const card = {
      dragging: true,
      layout,
      setEmpathy: vi.fn(),
      stopVortex: vi.fn(),
    } as unknown as InstanceType<typeof HanabiCard>;

    HanabiCard.prototype.removeLayoutChildFromParent.call(card);

    expect(card.dragging).toBe(false);
    // The drag handler must be gone before the drag stops, or the card would be played again.
    expect(calls).toEqual(["off dragend", "draggable false"]);
  });
});

describe("isMorphedBlank", () => {
  const UNKNOWN = {
    suitIndex: undefined,
    rank: undefined,
  } as const;
  const RED_ONE = {
    suitIndex: 0,
    rank: 1,
  } as const;
  const PRESENT_DECK_LENGTH = 12;

  function isBlank(order: number, morph?: typeof UNKNOWN | typeof RED_ONE) {
    const morphedIdentities: Array<typeof morph> = [];
    morphedIdentities[order] = morph;
    Object.assign(globals, {
      state: {
        replay: {
          hypothetical: {
            morphedIdentities,
          },
        },
        ongoingGame: {
          deck: Array.from({ length: PRESENT_DECK_LENGTH }),
        },
        // An ongoing game only knows the identities of some cards.
        cardIdentities: [
          ...Array.from({ length: PRESENT_DECK_LENGTH }, () => RED_ONE),
          ...Array.from({ length: PRESENT_DECK_LENGTH }, () => UNKNOWN),
        ],
      },
    });
    const card = Object.assign(Object.create(HanabiCard.prototype), {
      order,
      isStackBase: false,
    }) as InstanceType<typeof HanabiCard>;

    return card.isMorphedBlank();
  }

  test("keeps a hypothetical draw from beyond the real deck blank when drawn cards are shown", () => {
    expect(isBlank(PRESENT_DECK_LENGTH)).toBe(true);
  });

  test("reveals a hypothetical draw of a card from the real game when drawn cards are shown", () => {
    expect(isBlank(PRESENT_DECK_LENGTH - 1)).toBe(false);
  });

  test("shows a hypothetical draw from beyond the real deck once it is morphed", () => {
    expect(isBlank(PRESENT_DECK_LENGTH, RED_ONE)).toBe(false);
  });
});

interface MockShape {
  readonly visible: (value?: boolean) => boolean;
}

function mockShape(): MockShape {
  let visible = false;
  return {
    visible: (value?: boolean) => {
      if (value !== undefined) {
        visible = value;
      }
      return visible;
    },
  };
}

function visiblePips(suitShown: boolean, rankShown: boolean) {
  const card = Object.assign(Object.create(HanabiCard.prototype), {
    suitPips: mockShape(),
    rankPips: mockShape(),
    possibilityRows: mockShape(),
    // A Pink card clued 3 can be any 3 or any Pink card, so the card has possibility rows.
    possibilityRowsToDraw: [],
    pipsAllowed: {
      suit: !suitShown,
      rank: !rankShown,
    },
  }) as {
    suitPips: MockShape;
    rankPips: MockShape;
    possibilityRows: MockShape;
  };

  (
    HanabiCard.prototype as unknown as { updatePipVisibility: () => void }
  ).updatePipVisibility.call(card);

  return {
    suit: card.suitPips.visible(),
    rank: card.rankPips.visible(),
    rows: card.possibilityRows.visible(),
  };
}

describe("updatePipVisibility", () => {
  test("shows the possibility rows when the card shows neither suit nor rank", () => {
    expect(visiblePips(false, false)).toEqual({
      suit: false,
      rank: false,
      rows: true,
    });
  });

  test("shows the rank pips when the card shows its suit", () => {
    expect(visiblePips(true, false)).toEqual({
      suit: false,
      rank: true,
      rows: false,
    });
  });

  test("shows the suit pips when the card shows its rank", () => {
    expect(visiblePips(false, true)).toEqual({
      suit: true,
      rank: false,
      rows: false,
    });
  });
});
