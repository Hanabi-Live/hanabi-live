import { describe, expect, mock, test } from "bun:test";
import type { HanabiCard } from "./HanabiCard";

await mock.module("./UIGlobals", () => ({ globals: {} }));
await mock.module("../../tooltips", () => ({}));
await mock.module("./HanabiCardClick", () => ({ HanabiCardClick: mock() }));
await mock.module("./HanabiCardClickSpeedrun", () => ({
  mouseDownSpeedrun: mock(),
  mouseUpSpeedrun: mock(),
}));
await mock.module("./HanabiCardTouchActions", () => ({
  HanabiCardDblTap: mock(),
  HanabiCardTap: mock(),
}));
await mock.module("./arrows", () => ({}));
await mock.module("./cursor", () => ({}));
await mock.module("./konvaTooltips", () => ({}));
await mock.module("./notes", () => ({}));
const { registerMouseHandlers, setEmpathyOnHand } =
  await import("./HanabiCardMouse");
const { globals } = await import("./UIGlobals");

function makeCard(location: number, parent: unknown): HanabiCard {
  return {
    state: { location },
    layout: { parent },
  } as unknown as HanabiCard;
}

describe("setEmpathyOnHand", () => {
  test("applies empathy when the card is in its hand layout", () => {
    const setEmpathy = mock();
    const hand = { children: [{}], setEmpathy };
    Object.assign(globals, { elements: { playerHands: [hand] } });

    setEmpathyOnHand(makeCard(0, hand), true);

    expect(setEmpathy).toHaveBeenCalledWith(true);
  });

  test("does not call empathy on another container during a card animation", () => {
    const setEmpathy = mock();
    const hand = { children: [{}], setEmpathy };
    const deck = { children: [{}] };
    Object.assign(globals, { elements: { playerHands: [hand] } });

    // The state still says this card is in hand, but its UI node is in the deck.
    expect(() => {
      setEmpathyOnHand(makeCard(0, deck), true);
    }).not.toThrow();
    expect(setEmpathy).not.toHaveBeenCalled();
  });

  test("does not apply empathy to the wrong player's hand", () => {
    const setEmpathy0 = mock();
    const setEmpathy1 = mock();
    const firstHand = { children: [{}], setEmpathy: setEmpathy0 };
    const secondHand = { children: [{}], setEmpathy: setEmpathy1 };
    Object.assign(globals, {
      elements: { playerHands: [firstHand, secondHand] },
    });

    setEmpathyOnHand(makeCard(0, secondHand), true);

    expect(setEmpathy0).not.toHaveBeenCalled();
    expect(setEmpathy1).not.toHaveBeenCalled();
  });
});

describe("hypothetical empathy mouse handling", () => {
  test("recognizes the LayoutChild card despite a leading decoration", () => {
    const setEmpathy = mock();
    const handlers = new Map<string, () => void>();
    const card = {
      _id: 42,
      state: { location: 0 },
      layout: { parent: null as unknown, draggable: () => false },
      on: mock((event: string, handler: () => void) => {
        handlers.set(event, handler);
      }),
    } as unknown as HanabiCard;
    const hand = {
      children: [{ card, children: [{ isDecoration: true }] }],
      setEmpathy,
    };
    Object.assign(card.layout, { parent: hand });
    Object.assign(globals, {
      globalEmpathyEnabled: false,
      state: {
        replay: { hypothetical: { startingPlayerIndex: 0 } },
      },
      options: { speedrun: false },
      lobby: { settings: { speedrunMode: false } },
      elements: { playerHands: [hand] },
    });

    registerMouseHandlers.call(card);
    const mouseUp = handlers.get("mouseup");
    expect(mouseUp).toBeDefined();
    mouseUp?.call(card);

    expect(setEmpathy).not.toHaveBeenCalled();
  });
});
