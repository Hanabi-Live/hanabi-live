// Gives an element of a React component the site's tooltip. Do not use the HTML "title" attribute
// instead: it shows the browser's plain tooltip, which does not match the site.

import { Tooltip } from "./Tooltip.ts";
import { escapeHtml } from "./utils.ts";

/** React runs the function that a callback ref returns when the element goes away. */
type TooltipRef = (element: HTMLElement | null) => (() => void) | undefined;

interface ElementTooltip {
  readonly tooltip: Tooltip;
  content: string;
  /**
   * How many refs hold the tooltip. It is zero while React swaps the ref, and after it removes it.
   */
  refs: number;
}

interface TooltipRefOptions {
  /**
   * Whether the tooltip opens as soon as the pointer is over the element. Use it for an element
   * that only explains something, such as an info icon. By default, the tooltip waits for the
   * pointer to rest on the element, because people click most elements with tooltips, such as
   * buttons, and the tooltip would otherwise pop up as the pointer passes over them.
   */
  readonly instant?: boolean;
}

/** The tooltip of each element, which lasts while the element has a tooltip ref. */
const elementTooltips = new WeakMap<HTMLElement, ElementTooltip>();

/**
 * Returns a callback ref that shows `content`, which is HTML, in the site's tooltip while the
 * pointer is over the element. With no HTML, or empty HTML, the element has no tooltip. Escape any
 * text that users wrote, such as names, before it goes into the HTML. For plain text, use
 * `tooltipRef`.
 *
 * When the content changes, the element keeps its tooltip and only the content changes, so an open
 * tooltip stays open.
 */
export function tooltipRefHtml(
  content = "",
  options: TooltipRefOptions = {},
): TooltipRef {
  return (element) => {
    if (element === null) {
      return undefined;
    }

    let entry = elementTooltips.get(element);
    if (entry === undefined) {
      const tooltip = new Tooltip(element, { content: "" });
      tooltip.openOnHover(options.instant !== true);
      entry = { tooltip, content: "", refs: 0 };
      elementTooltips.set(element, entry);
    }
    entry.refs++;
    const { tooltip } = entry;
    // Most renders keep the content, so do not rebuild the tooltip's HTML for them.
    if (entry.content !== content) {
      entry.content = content;
      tooltip.setContent(content);
    }

    return () => {
      entry.refs--;
      // Each render makes a new ref, so React runs this and then gives the element the new ref, in
      // the same task. Wait until then, so that the tooltip is only destroyed with the element.
      queueMicrotask(() => {
        if (entry.refs === 0 && elementTooltips.get(element) === entry) {
          elementTooltips.delete(element);
          tooltip.destroy();
        }
      });
    };
  };
}

/**
 * Returns a callback ref that shows `text` in the site's tooltip, in its smaller text, while the
 * pointer is over the element. With no text, or empty text, the element has no tooltip. The text is
 * escaped, so it can hold names that users wrote.
 *
 * Unlike a hook, it can be used inside a loop, such as for each button in a row.
 */
export function tooltipRef(
  text: string | undefined,
  options: TooltipRefOptions = {},
): TooltipRef {
  return tooltipRefHtml(
    text === undefined || text === ""
      ? undefined
      : `<span class="small-tooltip-text">${escapeHtml(text)}</span>`,
    options,
  );
}
