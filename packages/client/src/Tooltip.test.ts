import { JSDOM } from "jsdom";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { pauseHoverTooltips, Tooltip } from "./Tooltip.ts";

const WINDOW_HEIGHT = 600;
const WINDOW_MARGIN = 8;

const dom = new JSDOM("<!doctype html><body></body>");
const { HTMLElement } = dom.window;
Object.defineProperties(dom.window, {
  innerHeight: {
    value: WINDOW_HEIGHT,
  },
  innerWidth: {
    value: 800,
  },
});

// The "jsdom" library neither opens popovers nor lays out elements. A bubble is as tall as its
// "data-height" attribute, unless its "--tooltip-room" property limits it, as the stylesheet does.
const openElements = new WeakSet<Element>();
/** The elements that match ":hover", which "jsdom" does not track. */
const hoveredElements = new WeakSet<Element>();
HTMLElement.prototype.showPopover = function showPopover(this: HTMLElement) {
  openElements.add(this);
};
HTMLElement.prototype.hidePopover = function hidePopover(this: HTMLElement) {
  openElements.delete(this);
};
Object.defineProperties(HTMLElement.prototype, {
  // The tooltip only matches ":popover-open" and ":hover".
  matches: {
    value(this: HTMLElement, selector: string) {
      return selector === ":hover"
        ? hoveredElements.has(this)
        : openElements.has(this);
    },
  },
  offsetHeight: {
    get(this: HTMLElement) {
      const height = Number(
        this.querySelector<HTMLElement>("[data-height]")?.dataset["height"],
      );
      const room = this.style.getPropertyValue("--tooltip-room");
      return room === "" ? height : Math.min(height, pixels(room));
    },
  },
});

// The "jsdom" library has no animations. The tests run the ones in this list.
class FakeKeyframeEffect {
  readonly target: Element;

  constructor(target: Element) {
    this.target = target;
  }
}
const runningAnimations: Animation[] = [];
Object.defineProperty(dom.window, "KeyframeEffect", {
  value: FakeKeyframeEffect,
});
dom.window.document.getAnimations = () => runningAnimations;

/** Starts a move of an element, which ends when the returned function runs. */
function startMove(element: Element): () => void {
  const move = Object.assign(new dom.window.EventTarget(), {
    playState: "running",
    effect: Object.assign(new FakeKeyframeEffect(element), {
      getComputedTiming: () => ({ endTime: 300 }),
      getKeyframes: () => [
        { transform: "translate(100px, 0px)" },
        { transform: "none" },
      ],
    }),
  }) as unknown as Animation;
  runningAnimations.push(move);
  return () => {
    runningAnimations.splice(runningAnimations.indexOf(move), 1);
    Object.assign(move, { playState: "finished" });
    move.dispatchEvent(new dom.window.Event("finish"));
  };
}

function pixels(value: string) {
  return Number(value.replace(/px$/u, ""));
}

const domGlobals = {
  AbortController: dom.window.AbortController,
  document: dom.window.document,
  MutationObserver: dom.window.MutationObserver,
  window: dom.window,
};
const savedGlobals = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  for (const [name, value] of Object.entries(domGlobals)) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
      writable: true,
    });
  }
});

afterAll(() => {
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, name);
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
});

/** Opens a tooltip of the given height beside an anchor from "top" to "bottom". */
function openTooltip(top: number, bottom: number, height: number) {
  const anchor = dom.window.document.createElement("div");
  anchor.getBoundingClientRect = () => ({
    x: 100,
    y: top,
    left: 100,
    top,
    right: 150,
    bottom,
    width: 50,
    height: bottom - top,
    toJSON: () => ({}),
  });
  dom.window.document.body.append(anchor);
  const tooltip = new Tooltip(anchor, {
    content: `<div data-height="${height}"></div>`,
  });
  tooltip.open();

  const bubble = dom.window.document.querySelector<HTMLElement>(
    ".tooltip-bubble:last-child",
  );
  tooltip.destroy();
  anchor.remove();
  return {
    side: bubble?.dataset["side"],
    top: pixels(bubble?.style.top ?? ""),
    room: bubble?.style.getPropertyValue("--tooltip-room"),
  };
}

test("a tooltip opens above its anchor when it fits there", () => {
  expect(openTooltip(300, 400, 100)).toStrictEqual({
    side: "top",
    top: 200,
    room: "",
  });
});

test("a tooltip opens below an anchor near the top of the window", () => {
  expect(openTooltip(50, 150, 200)).toStrictEqual({
    side: "bottom",
    top: 150,
    room: "",
  });
});

test("a tooltip too tall for both sides stays inside the window", () => {
  const roomAbove = 300 - WINDOW_MARGIN;
  expect(openTooltip(300, 400, 500)).toStrictEqual({
    side: "top",
    top: WINDOW_MARGIN,
    room: `${roomAbove}px`,
  });
});

test("a tooltip closes when its anchor is removed", async () => {
  const anchor = dom.window.document.createElement("div");
  dom.window.document.body.append(anchor);
  const tooltip = new Tooltip(anchor, { content: "Text" });
  tooltip.open();
  expect(tooltip.isOpen).toBe(true);

  anchor.remove();
  // The page reports removed elements in a microtask.
  await Promise.resolve();

  expect(tooltip.isOpen).toBe(false);
  tooltip.destroy();
});

test("an anchor is marked while its tooltip is open", () => {
  const anchor = dom.window.document.createElement("div");
  dom.window.document.body.append(anchor);
  const tooltip = new Tooltip(anchor, { content: "Text" });
  tooltip.open();
  expect(anchor.dataset["tooltipOpen"]).toBe("");

  tooltip.close();
  expect(anchor.dataset["tooltipOpen"]).toBeUndefined();
  tooltip.destroy();
  anchor.remove();
});

/** A mouse event of the given type. */
function pointerEvent(type: string) {
  // The "jsdom" library has no "PointerEvent", but the tooltip only reads "pointerType".
  return Object.assign(new dom.window.Event(type), { pointerType: "mouse" });
}

test("a tooltip that gets its content back opens again while the mouse is over its anchor", () => {
  const anchor = dom.window.document.createElement("div");
  dom.window.document.body.append(anchor);
  const tooltip = new Tooltip(anchor, { content: "Note" });
  tooltip.openOnHover(false);
  anchor.dispatchEvent(pointerEvent("pointerenter"));
  expect(tooltip.isOpen).toBe(true);

  tooltip.setContent("");
  expect(tooltip.isOpen).toBe(false);
  tooltip.setContent("Note");
  expect(tooltip.isOpen).toBe(true);

  anchor.dispatchEvent(pointerEvent("pointerleave"));
  tooltip.setContent("");
  tooltip.setContent("Note");
  expect(tooltip.isOpen).toBe(false);
  tooltip.destroy();
  anchor.remove();
});

test("a tooltip keeps its content while it fades out", () => {
  const anchor = dom.window.document.createElement("div");
  dom.window.document.body.append(anchor);
  const tooltip = new Tooltip(anchor, { content: "Note" });
  tooltip.open();
  // The bubble of a tooltip that an earlier test destroyed can still be fading out.
  const box =
    dom.window.document.body.lastElementChild?.querySelector(".tooltip-box");

  tooltip.setContent("");
  expect(tooltip.isClosing).toBe(true);
  expect(box?.textContent).toBe("Note");

  // New content waits until the tooltip opens again.
  tooltip.setContent("Other note");
  expect(box?.textContent).toBe("Note");
  tooltip.open();
  expect(box?.textContent).toBe("Other note");
  tooltip.destroy();
  anchor.remove();
});

test("a tooltip fades out when it is destroyed while open", () => {
  vi.useFakeTimers();
  try {
    const anchor = dom.window.document.createElement("div");
    dom.window.document.body.append(anchor);
    const tooltip = new Tooltip(anchor, { content: "Text" });
    tooltip.open();
    const bubble = dom.window.document.querySelector(
      ".tooltip-bubble:last-child",
    );

    anchor.remove();
    tooltip.destroy();
    expect(tooltip.isClosing).toBe(true);
    expect(bubble?.isConnected).toBe(true);

    vi.runAllTimers();
    expect(bubble?.isConnected).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test("hover tooltips stay shut while paused and open again after", () => {
  const anchor = dom.window.document.createElement("div");
  dom.window.document.body.append(anchor);
  const tooltip = new Tooltip(anchor, { content: "Text" });
  tooltip.openOnHover(false);
  anchor.dispatchEvent(pointerEvent("pointerenter"));
  expect(tooltip.isOpen).toBe(true);

  const resume = pauseHoverTooltips();
  expect(tooltip.isOpen).toBe(false);
  anchor.dispatchEvent(pointerEvent("pointerleave"));
  anchor.dispatchEvent(pointerEvent("pointerenter"));
  expect(tooltip.isOpen).toBe(false);

  resume();
  expect(tooltip.isOpen).toBe(true);
  tooltip.destroy();
  anchor.remove();
});

test("a tooltip waits for its anchor to stop moving under the pointer", () => {
  const card = dom.window.document.createElement("div");
  const anchor = dom.window.document.createElement("div");
  card.append(anchor);
  dom.window.document.body.append(card);
  const tooltip = new Tooltip(anchor, { content: "Note" });
  tooltip.openOnHover(false);

  // The card stops under the pointer.
  let endMove = startMove(card);
  hoveredElements.add(anchor);
  anchor.dispatchEvent(pointerEvent("pointerenter"));
  expect(tooltip.isOpen).toBe(false);
  endMove();
  expect(tooltip.isOpen).toBe(true);

  // The card moves on, away from the pointer.
  tooltip.close();
  anchor.dispatchEvent(pointerEvent("pointerleave"));
  endMove = startMove(card);
  anchor.dispatchEvent(pointerEvent("pointerenter"));
  hoveredElements.delete(anchor);
  anchor.dispatchEvent(pointerEvent("pointerleave"));
  endMove();
  expect(tooltip.isOpen).toBe(false);

  tooltip.destroy();
  card.remove();
});
