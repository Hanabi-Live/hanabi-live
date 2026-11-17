// @vitest-environment jsdom

import type { CardOrder, CardState, PlayerIndex } from "@hanabi-live/game";
import { beforeEach, expect, test } from "vitest";
import { findArrowAnchor, getArrowTargetAt } from "./arrowAnchor.ts";

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
