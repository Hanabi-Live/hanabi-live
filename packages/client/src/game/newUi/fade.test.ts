// @vitest-environment jsdom

import { expect, test, vi } from "vitest";
import { fadeOutCopy } from "./fade.ts";

test("a copy has no IDs and keeps the text in its boxes", () => {
  // The "jsdom" library has no animations.
  Element.prototype.animate = vi.fn(() => new EventTarget() as Animation);
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
