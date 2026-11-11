// Gives an element of a React component the site's tooltip. Do not use the HTML "title" attribute
// instead: it shows the browser's plain tooltip, which does not match the site.

import { Tooltip } from "./Tooltip.ts";
import { escapeHtml } from "./utils.ts";

/** React runs the function that a callback ref returns when the element goes away. */
type TooltipRef = (element: HTMLElement | null) => (() => void) | undefined;

/**
 * The ref for each tooltip's HTML, so that the same tooltip gives the same ref on every render.
 * Otherwise, React would close and reopen the tooltip whenever the component renders again.
 */
const refs = new Map<string, TooltipRef>();

/**
 * Returns a callback ref that shows `content`, which is HTML, in the site's tooltip while the
 * pointer is over the element. With no HTML, or empty HTML, the element has no tooltip. Escape any
 * text that users wrote, such as names, before it goes into the HTML. For plain text, use
 * `tooltipRef`.
 */
export function tooltipRefHtml(content: string | undefined): TooltipRef {
  const key = content ?? "";
  let ref = refs.get(key);
  if (ref === undefined) {
    ref = (element) => {
      if (element === null || content === undefined || content === "") {
        return undefined;
      }

      const tooltip = new Tooltip(element, { content });
      tooltip.openOnHover();
      return () => {
        tooltip.destroy();
      };
    };
    refs.set(key, ref);
  }

  return ref;
}

/**
 * Returns a callback ref that shows `text` in the site's tooltip, in its smaller text, while the
 * pointer is over the element. With no text, or empty text, the element has no tooltip. The text is
 * escaped, so it can hold names that users wrote.
 *
 * Unlike a hook, it can be used inside a loop, such as for each button in a row.
 */
export function tooltipRef(text: string | undefined): TooltipRef {
  return tooltipRefHtml(
    text === undefined || text === ""
      ? undefined
      : `<span class="small-tooltip-text">${escapeHtml(text)}</span>`,
  );
}
