import { defaultSettings } from "@hanabi-live/data";
import { describe, expect, test, vi } from "vitest";
import { settingsChanged } from "../../sessionSlice.ts";
import { store } from "../../store.ts";
import type { HanabiCard } from "./HanabiCard.ts";

vi.mock("./UiGlobals.ts", () => ({
  globals: {},
}));
vi.mock("../../tooltips.ts", () => ({ close: vi.fn() }));
vi.mock("./HanabiCardClick.ts", () => ({ HanabiCardClick: vi.fn() }));
vi.mock("./HanabiCardClickSpeedrun.ts", () => ({
  mouseDownSpeedrun: vi.fn(),
  mouseUpSpeedrun: vi.fn(),
}));
vi.mock("./HanabiCardTouchActions.ts", () => ({
  HanabiCardDblTap: vi.fn(),
  HanabiCardTap: vi.fn(),
}));
vi.mock("./arrows.ts", () => ({}));
vi.mock("./clueLog/mountClueLog.tsx", () => ({
  showClueMatches: vi.fn(),
}));
vi.mock("./cursor.ts", () => ({ set: vi.fn() }));
vi.mock("./konvaTooltips.ts", () => ({
  setActiveHover: vi.fn(),
  resetActiveHover: vi.fn(),
}));
vi.mock("./notes.ts", () => ({}));
const { registerMouseHandlers, setEmpathyOnHand } =
  await import("./HanabiCardMouse.ts");
const { globals } = await import("./UiGlobals.ts");
const tooltips = await import("../../tooltips.ts");

function makeCard(parent: unknown): HanabiCard {
  return {
    state: {
      location: 0,
    },
    layout: {
      parent,
    },
  } as unknown as HanabiCard;
}

describe("setEmpathyOnHand", () => {
  test("applies empathy when the card is in its hand layout", () => {
    const setEmpathy = vi.fn();
    const hand = {
      children: [{}],
      setEmpathy,
    };
    Object.assign(globals, {
      elements: {
        playerHands: [hand],
      },
    });

    setEmpathyOnHand(makeCard(hand), true);

    expect(setEmpathy).toHaveBeenCalledWith(true);
  });

  test("does not call empathy on another container during a card animation", () => {
    const setEmpathy = vi.fn();
    const hand = {
      children: [{}],
      setEmpathy,
    };
    const deck = { children: [{}] };
    Object.assign(globals, {
      elements: {
        playerHands: [hand],
      },
    });

    // The state still says this card is in hand, but its UI node is in the deck.
    expect(() => {
      setEmpathyOnHand(makeCard(deck), true);
    }).not.toThrow();
    expect(setEmpathy).not.toHaveBeenCalled();
  });

  test("does not apply empathy to the wrong player's hand", () => {
    const setEmpathy0 = vi.fn();
    const setEmpathy1 = vi.fn();
    const firstHand = {
      children: [{}],
      setEmpathy: setEmpathy0,
    };
    const secondHand = {
      children: [{}],
      setEmpathy: setEmpathy1,
    };
    Object.assign(globals, {
      elements: {
        playerHands: [firstHand, secondHand],
      },
    });

    setEmpathyOnHand(makeCard(secondHand), true);

    expect(setEmpathy0).not.toHaveBeenCalled();
    expect(setEmpathy1).not.toHaveBeenCalled();
  });
});

describe("hypothetical empathy mouse handling", () => {
  test("recognizes the LayoutChild card despite a leading decoration", () => {
    const setEmpathy = vi.fn();
    const handlers = new Map<string, () => void>();
    const card = {
      _id: 42,
      state: {
        location: 0,
      },
      layout: {
        parent: null as unknown,
        draggable: () => false,
      },
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler);
      }),
    } as unknown as HanabiCard;
    const hand = {
      children: [
        {
          card,
          children: [{ isDecoration: true }],
        },
      ],
      setEmpathy,
    };
    Object.assign(card.layout, { parent: hand });
    Object.assign(globals, {
      globalEmpathyEnabled: false,
      state: {
        replay: {
          hypothetical: {
            startingPlayerIndex: 0,
          },
        },
      },
      options: {
        speedrun: false,
      },
      elements: {
        playerHands: [hand],
      },
    });

    registerMouseHandlers.call(card);
    const mouseUp = handlers.get("mouseup");
    expect(mouseUp).toBeDefined();
    mouseUp?.call(card);

    expect(setEmpathy).not.toHaveBeenCalled();
  });
});

function pressCard() {
  // Stand in for the browser window, which receives the pointer release.
  const window = new EventTarget();
  vi.stubGlobal("addEventListener", window.addEventListener.bind(window));
  const handlers = new Map<string, (event: unknown) => void>();
  let rotation = 0;
  const position = {
    x: 10,
    y: 20,
  };
  const hand = {
    rotation: () => -90,
    children: [],
    moveToTop: vi.fn(),
  };
  const cardCanvas = {
    style: {
      zIndex: "",
    },
  };
  const cardLayer = {
    batchDraw: vi.fn(),
    getNativeCanvasElement: () => cardCanvas,
  };
  const card = {
    tooltipName: "card-0",
    state: {
      location: 1,
      order: 0,
    },
    layout: {
      parent: hand,
      draggable: () => true,
      isListening: () => true,
      rotation: (value?: number) => {
        if (value !== undefined) {
          rotation = value;
        }
        return rotation;
      },
      position: () => ({ ...position }),
    },
    setRaiseAndShadowOffset: vi.fn(),
    setCursor: vi.fn(),
    on: vi.fn((event: string, handler: (event: unknown) => void) => {
      handlers.set(event, handler);
    }),
  } as unknown as HanabiCard;
  store.dispatch(
    settingsChanged({
      ...defaultSettings,
      keldonMode: true,
    }),
  );
  Object.assign(globals, {
    state: {
      replay: {
        hypothetical: {
          startingPlayerIndex: undefined,
        },
      },
    },
    options: {
      speedrun: false,
    },
    elements: {
      editCardsCheckbox: undefined,
      playerHands: [],
      arrows: [],
    },
    layers: {
      card: cardLayer,
    },
  });

  registerMouseHandlers.call(card);
  // Shift disables empathy, which this test does not cover.
  handlers.get("mousedown")?.call(card, {
    evt: {
      buttons: 1,
      shiftKey: true,
    },
  });
  vi.unstubAllGlobals();
  return {
    getRotation: () => rotation,
    getCardCanvasOrder: () => cardCanvas.style.zIndex,
    position,
    release: () => window.dispatchEvent(new Event("pointerup")),
  };
}

describe("hypothetical card rotation in Keldon mode", () => {
  test("restores the hand rotation when the card is released without moving", () => {
    const { getRotation, release } = pressCard();
    expect(getRotation()).toBe(90);

    release();

    expect(getRotation()).toBe(0);
  });

  test("leaves a dragged card to the drag handling", () => {
    const { getRotation, position, release } = pressCard();
    position.x += 50;

    release();

    expect(getRotation()).toBe(90);
  });
});

describe("dragging a card", () => {
  test("draws the cards above the other layers until the card is released", () => {
    const { getCardCanvasOrder, release } = pressCard();
    expect(getCardCanvasOrder()).toBe("1");
    expect(tooltips.close).toHaveBeenCalledWith("card-0");

    release();

    expect(getCardCanvasOrder()).toBe("");
  });
});

describe("touching a card", () => {
  test("closes its note tooltip when the finger lifts off the card", () => {
    // Stand in for the browser window, which receives the touch release.
    const window = new EventTarget();
    vi.stubGlobal("addEventListener", window.addEventListener.bind(window));
    vi.stubGlobal(
      "removeEventListener",
      window.removeEventListener.bind(window),
    );
    const handlers = new Map<string, (event: unknown) => void>();
    const card = {
      tooltipName: "card-0",
      state: {
        location: 0,
        order: 0,
      },
      layout: {
        parent: null,
      },
      noteIndicator: {
        isVisible: () => false,
      },
      setCursor: vi.fn(),
      on: vi.fn((event: string, handler: (event: unknown) => void) => {
        handlers.set(event, handler);
      }),
    } as unknown as HanabiCard;
    Object.assign(globals, {
      editingNote: undefined,
      globalEmpathyEnabled: true,
      state: {
        replay: {
          hypothetical: undefined,
        },
      },
    });

    registerMouseHandlers.call(card);
    // Shift disables empathy, which this test does not cover.
    handlers.get("touchstart")?.call(card, {
      evt: {
        shiftKey: true,
      },
    });
    vi.mocked(tooltips.close).mockClear();

    // Konva sends the release to the shape under the finger, which is no longer this card.
    window.dispatchEvent(new Event("touchend"));
    window.dispatchEvent(new Event("touchend"));
    vi.unstubAllGlobals();

    expect(tooltips.close).toHaveBeenCalledOnce();
    expect(tooltips.close).toHaveBeenCalledWith("card-0");
  });
});
