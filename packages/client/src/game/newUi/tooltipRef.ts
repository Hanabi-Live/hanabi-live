// Gives an element of the new game screen the site's tooltip. Do not use the HTML "title" attribute
// instead: it shows the browser's plain tooltip, which does not match the site.

import { Tooltip } from "../../Tooltip.ts";
import { escapeHtml } from "../../utils.ts";

// React runs the function that a callback ref returns when the element goes away.
type TooltipRef = (element: HTMLElement | null) => (() => void) | undefined;

/** The ref for each text, so that the same text gives the same ref on every render. */
const refs = new Map<string, TooltipRef>();

/**
 * Returns a callback ref that shows `text` in the site's tooltip while the pointer is over the
 * element. With no text, or empty text, the element has no tooltip. The text is plain text, not
 * HTML.
 *
 * The same text always gives the same ref, so React does not close and reopen the tooltip when the
 * screen renders again.
 */
export function tooltipRef(text: string | undefined): TooltipRef {
  const key = text ?? "";
  let ref = refs.get(key);
  if (ref === undefined) {
    const content =
      text === undefined || text === ""
        ? undefined
        : `<span class="small-tooltip-text">${escapeHtml(text)}</span>`;
    ref = (element) => {
      if (element === null || content === undefined) {
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
