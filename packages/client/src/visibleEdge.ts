// The visible edge of an element, which can be outside of its box.

/**
 * Returns how far the visible edge of an element is outside of its box, in the window's pixels. An
 * element can draw its border outside of its box, as a ring (a `box-shadow` without an offset or a
 * blur) and as an outline, such as a card on the game screen. An arrow that points at the element
 * ends at this edge.
 */
export function getVisibleEdge(element: Element): number {
  // The element can be in another window, such as the popped-out chat of the New UI.
  const style = (
    element.ownerDocument.defaultView ?? globalThis
  ).getComputedStyle(element);
  let edge = 0;
  // The browser writes each shadow as its color and then its lengths, such as "rgb(255, 159, 28)
  // 0px 0px 0px 4px". Only a comma before a color starts the next shadow.
  for (const shadow of style.boxShadow.split(/, (?=[a-z])/u)) {
    const lengths = shadow
      .split(" ")
      .filter((word) => word.endsWith("px"))
      .map((word) => pixels(word));
    if (shadow.includes("inset") || lengths.length !== 4) {
      continue;
    }
    const [x, y, blur, spread] = lengths as [number, number, number, number];
    if (x === 0 && y === 0 && blur === 0) {
      edge = Math.max(edge, spread);
    }
  }
  if (style.outlineStyle !== "none") {
    edge = Math.max(
      edge,
      pixels(style.outlineOffset) + pixels(style.outlineWidth),
    );
  }
  // The lengths are in the element's CSS pixels, which a zoomed screen makes larger.
  return edge === 0 ? 0 : edge * element.currentCSSZoom;
}

/**
 * Returns the number in a length in pixels that the browser computed, such as "4px", or 0 for no
 * length.
 */
export function pixels(length: string): number {
  return Number(length.replace("px", ""));
}
