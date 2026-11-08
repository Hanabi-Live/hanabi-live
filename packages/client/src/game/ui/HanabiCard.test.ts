import { describe, expect, test, vi } from "vitest";

vi.mock("./UIGlobals", () => ({ globals: { activeHover: null } }));
vi.mock("../../tooltips", () => ({}));
vi.mock("../../Globals", () => ({ globals: {} }));
vi.mock("./noteCheckImpossibility", () => ({
  checkNoteImpossibility: vi.fn(),
  possibleCardsFromNoteAndClues: vi.fn(),
}));
vi.mock("./HanabiCardMouse", () => ({
  registerMouseHandlers: vi.fn(),
  setCursor: vi.fn(),
  setEmpathyOnHand: vi.fn(),
}));
vi.mock("./notes", () => ({}));
vi.mock("./LayoutChild", () => ({ LayoutChild: vi.fn() }));
const { HanabiCard } = await import("./HanabiCard");
const { globals } = await import("./UIGlobals");

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
    } as unknown as InstanceType<typeof HanabiCard>;

    HanabiCard.prototype.removeLayoutChildFromParent.call(card);

    expect(card.dragging).toBe(false);
    // The drag handler must be gone before the drag stops, or the card would be played again.
    expect(calls).toEqual(["off dragend", "draggable false"]);
  });
});

describe("isMorphedBlank", () => {
  const UNKNOWN = { suitIndex: null, rank: null } as const;
  const RED_ONE = { suitIndex: 0, rank: 1 } as const;
  const PRESENT_DECK_LENGTH = 12;

  function isBlank(order: number, morph?: typeof UNKNOWN | typeof RED_ONE) {
    const morphedIdentities: Array<typeof morph> = [];
    morphedIdentities[order] = morph;
    Object.assign(globals, {
      state: {
        replay: { hypothetical: { morphedIdentities } },
        ongoingGame: { deck: Array.from({ length: PRESENT_DECK_LENGTH }) },
        // An ongoing game only knows the identities of some cards.
        cardIdentities: [
          ...Array.from({ length: PRESENT_DECK_LENGTH }, () => RED_ONE),
          ...Array.from({ length: PRESENT_DECK_LENGTH }, () => UNKNOWN),
        ],
      },
    });
    const card = Object.assign(Object.create(HanabiCard.prototype), {
      _state: { order },
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
