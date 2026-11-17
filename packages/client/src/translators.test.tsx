// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, test } from "vitest";
import { allowTranslators } from "./translators.ts";

beforeAll(() => {
  allowTranslators();
});

afterEach(cleanup);

function Greeting({ show }: { readonly show: boolean }): React.JSX.Element {
  return (
    <p>
      {show && "Hello"}
      <span>world</span>
    </p>
  );
}

/** Shows the greeting, and translates its text the way Microsoft's translator does. */
function renderTranslated() {
  const rendered = render(<Greeting show />);
  const text = rendered.container.querySelector("p")?.firstChild;
  const font = document.createElement("font");
  font.textContent = "Bonjour";
  text?.replaceWith(font);
  return rendered;
}

test("React can remove text that a translator replaced", () => {
  const { container, rerender } = renderTranslated();

  expect(() => {
    rerender(<Greeting show={false} />);
  }).not.toThrow();
  expect(container.querySelector("span")?.textContent).toBe("world");
});

test("React can add text before text that a translator replaced", () => {
  const { container, rerender } = renderTranslated();

  expect(() => {
    rerender(<Greeting show={false} />);
    rerender(<Greeting show />);
  }).not.toThrow();
  expect(container.textContent).toContain("Hello");
});

test("a node that is not a child is still an error on a page that no translator changed", () => {
  const list = document.createElement("div");
  document.body.append(list);
  const stray = document.createTextNode("stray");

  // eslint-disable-next-line unicorn/prefer-dom-node-remove -- React calls this method.
  expect(() => list.removeChild(stray)).toThrow();
  list.remove();
});
