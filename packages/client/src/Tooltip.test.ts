import { JSDOM } from "jsdom";
import { afterAll, beforeAll, expect, test } from "vitest";
import { Tooltip } from "./Tooltip.ts";

const WINDOW_HEIGHT = 600;
const WINDOW_MARGIN = 8;

const dom = new JSDOM("<!doctype html><body></body>");
const { HTMLElement } = dom.window;
Object.defineProperties(dom.window, {
  innerHeight: { value: WINDOW_HEIGHT },
  innerWidth: { value: 800 },
});

// The "jsdom" library neither opens popovers nor lays out elements. A bubble is as tall as its
// "data-height" attribute, unless its "--tooltip-room" property limits it, as the stylesheet does.
const openElements = new WeakSet<Element>();
HTMLElement.prototype.showPopover = function showPopover(this: HTMLElement) {
  openElements.add(this);
};
HTMLElement.prototype.hidePopover = function hidePopover(this: HTMLElement) {
  openElements.delete(this);
};
Object.defineProperties(HTMLElement.prototype, {
  // The tooltip only matches ":popover-open".
  matches: {
    value(this: HTMLElement) {
      return openElements.has(this);
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

function pixels(value: string) {
  return Number(value.replace(/px$/u, ""));
}

const domGlobals = { document: dom.window.document, window: dom.window };
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
