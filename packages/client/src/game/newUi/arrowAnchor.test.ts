// @vitest-environment jsdom

import type { CardOrder, CardState, PlayerIndex } from "@hanabi-live/game";
import { beforeEach, expect, test } from "vitest";
import {
  findArrowAnchor,
  findFirstNumberText,
  getArrowTargetAt,
} from "./arrowAnchor.ts";

/** Adds an element with these attributes to `parent`, and returns it. */
function add(
  parent: Element,
  attributes: Readonly<Record<string, string>>,
): HTMLElement {
  const element = document.createElement("span");
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  parent.append(element);
  return element;
}

beforeEach(() => {
  document.body.replaceChildren();
  const stack = add(document.body, {
    "data-stack-base-arrow": "52",
    "data-stack-slot": "2",
  });
  add(add(stack, { "data-card-order": "9" }), { id: "top" });
  const emptyStack = add(document.body, {
    "data-stack-base-arrow": "53",
    "data-stack-slot": "3",
  });
  add(emptyStack, { id: "base" });
  const score = add(document.body, { "data-score": "" });
  add(score, { id: "score" });
  add(score, {
    id: "max",
    "data-out-of-max": "",
  });
  const efficiency = add(document.body, { "data-efficiency": "" });
  add(efficiency, {
    id: "min",
    "data-out-of-max": "",
  });
  add(document.body, {
    id: "strike",
    "data-strike-box": "1",
  });
  add(add(document.body, { "data-name-chip": "1" }), { id: "name" });
  const discardPile = add(document.body, { "data-discard-pile": "" });
  add(add(discardPile, { "data-card-order": "7" }), { id: "discard" });
  add(discardPile, {
    id: "trash",
    "data-discard-pile-icon": "",
  });
});

function byId(id: string): Element {
  return document.querySelector(`#${id}`)!;
}

test("a right-click finds the card or the number that it lands on", () => {
  expect(getArrowTargetAt(byId("top"))).toBe(9);
  expect(getArrowTargetAt(byId("base"))).toBe(53);
  expect(getArrowTargetAt(byId("score"))).toBe("score");
  expect(getArrowTargetAt(byId("max"))).toBe("maxScore");
  expect(getArrowTargetAt(byId("min"))).toBe("minEfficiency");
  expect(getArrowTargetAt(byId("strike"))).toBe("strike2");
  expect(getArrowTargetAt(byId("discard"))).toBe(7);
  expect(getArrowTargetAt(byId("trash"))).toBe("discardPile");
  expect(getArrowTargetAt(document.body)).toBeUndefined();
});

test("a played card under the top of its stack points at the stack", () => {
  const deck = [] as CardState[];
  deck[4] = {
    location: "playStack",
    suitIndex: 2,
  } as unknown as CardState;
  expect(findArrowAnchor(document, 4 as CardOrder, deck)).toBe(
    document.querySelector('[data-stack-slot="2"]'),
  );
  expect(findArrowAnchor(document, 9 as CardOrder, deck)).toBe(
    document.querySelector('[data-card-order="9"]'),
  );
  expect(findArrowAnchor(document, 53 as CardOrder, deck)).toBe(
    document.querySelector('[data-stack-slot="3"]'),
  );
  expect(findArrowAnchor(document, "maxScore", deck)).toBe(byId("max"));
  expect(findArrowAnchor(document, "discardPile", deck)).toBe(byId("trash"));
});

test("a right-click on a player's name points at the name", () => {
  const target = getArrowTargetAt(byId("name"));
  expect(target).toStrictEqual({
    playerIndex: 1,
  });
  expect(findArrowAnchor(document, target!, [])).toBe(
    document.querySelector('[data-name-chip="1"]'),
  );
  expect(
    findArrowAnchor(document, { playerIndex: 2 as PlayerIndex }, []),
  ).toBeUndefined();
});

test("a target in a hidden tab points at the tab", () => {
  const tab = add(document.body, {
    role: "tab",
    "aria-controls": "status",
    "aria-selected": "false",
  });
  const panel = add(document.body, {
    id: "status",
    role: "tabpanel",
  });
  const pace = add(panel, { "data-pace": "" });
  expect(findArrowAnchor(document, "pace", [])).toBe(tab);

  tab.setAttribute("aria-selected", "true");
  expect(findArrowAnchor(document, "pace", [])).toBe(pace);
});

test("the first number of a value is its own text, not the invisible copy before it", () => {
  // As in "StatusStrip.tsx": a hidden copy holds the space, and wrappers are around the text.
  const value = add(document.body, {});
  const grid = add(value, {});
  const copy = add(grid, { "aria-hidden": "true" });
  copy.append("10 ");
  add(copy, {}).append("/ 25");
  const line = add(add(grid, { id: "shown" }), {});
  line.append("7 ");
  add(line, {}).append("/ 25");

  const text = findFirstNumberText(value);

  expect(text?.textContent.trim()).toBe("7");
  expect(text?.parentElement?.closest("#shown")).not.toBeNull();
});
