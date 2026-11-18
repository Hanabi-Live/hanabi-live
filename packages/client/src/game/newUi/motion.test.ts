// @vitest-environment jsdom

import { beforeEach, expect, test, vi } from "vitest";
import { fadeOutCopy } from "./motion.ts";

beforeEach(() => {
  document.body.replaceChildren();
  // The "jsdom" library has no animations. An animation here only sends its events.
  Element.prototype.animate = vi.fn(() => {
    const animation = new EventTarget() as Animation;
    animation.cancel = () => {
      animation.dispatchEvent(new Event("cancel"));
    };
    return animation;
  });
});

test("a copy has no IDs and keeps the text in its boxes", () => {
  const element = document.createElement("div");
  element.id = "chat";
  const messages = document.createElement("ul");
  messages.id = "chat-text";
  const input = document.createElement("input");
  input.id = "chat-input";
  element.append(messages, input);
  document.body.append(element);
  input.value = "hello";

  fadeOutCopy(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 80 });
  element.remove();

  // The page still finds no element by these IDs, so that it does not add messages to the copy.
  expect(document.querySelectorAll("[id]")).toHaveLength(0);
  expect(document.querySelector("input")?.value).toBe("hello");
});

test("a copy goes at once when the element stays on the page", async () => {
  // Such as when React's strict mode runs the cleanup of a new element's effects.
  const element = document.createElement("div");
  document.body.append(element);

  fadeOutCopy(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 80 });
  expect(document.body.children).toHaveLength(2);

  await Promise.resolve();
  expect(document.body.children).toHaveLength(1);
});

test("a copy of a card is not found as a card", () => {
  const element = document.createElement("div");
  const card = document.createElement("div");
  card.dataset["cardOrder"] = "3";
  card.dataset["cardPlace"] = "queued";
  element.append(card);
  document.body.append(element);

  fadeOutCopy(element, [{ opacity: 1 }, { opacity: 0 }], { duration: 80 });
  element.remove();

  // The cards that move are found by their order (see "cardMotion.ts").
  expect(document.querySelectorAll("[data-card-order]")).toHaveLength(0);
  expect(document.querySelectorAll("[data-card-place]")).toHaveLength(0);
});
