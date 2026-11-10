// A tooltip that opens beside an anchor element. The bubble is a manual popover, so it is drawn in
// the top layer above every other element, including modals.

/** The height of the arrow that points from the tooltip to its anchor. */
const ARROW_SIZE_IN_PIXELS = 6;

/** How long a tooltip takes to fade in. */
const OPEN_DURATION_IN_MILLISECONDS = 120;

/** How long a tooltip takes to fade out. It is quicker than opening, to get out of the way. */
const CLOSE_DURATION_IN_MILLISECONDS = 80;

/** How far a tooltip slides away from its anchor as it opens. */
const SLIDE_IN_PIXELS = 4;

/** The closest that a tooltip comes to the edge of the window. */
const WINDOW_MARGIN_IN_PIXELS = 8;

/** How often an open tooltip checks whether its anchor has been removed from the page. */
const ANCHOR_CHECK_INTERVAL_IN_MILLISECONDS = 500;

export type TooltipSide = "top" | "bottom";

interface TooltipOptions {
  /** HTML, or an element to move into the tooltip. */
  readonly content: Node | string;

  /** Whether the pointer can interact with the content, such as a text box for a note. */
  readonly interactive?: boolean;

  readonly centered?: boolean;
}

export class Tooltip {
  /**
   * The side of the anchor that the tooltip opens on. By default, it opens above the anchor, unless
   * only the space below the anchor fits it.
   */
  side: TooltipSide | undefined;

  private readonly anchor: HTMLElement;
  private readonly bubble = document.createElement("div");
  private readonly box = document.createElement("div");
  private content: Node | string = "";
  private closingTimeout: ReturnType<typeof setTimeout> | undefined;
  private anchorCheckInterval: ReturnType<typeof setInterval> | undefined;
  private readonly hoverListeners = new AbortController();

  constructor(anchor: HTMLElement, options: TooltipOptions) {
    this.anchor = anchor;

    this.bubble.className = "tooltip-bubble";
    this.bubble.popover = "manual";
    this.bubble.classList.toggle(
      "tooltip-interactive",
      options.interactive === true,
    );
    this.bubble.style.setProperty(
      "--tooltip-open-duration",
      `${OPEN_DURATION_IN_MILLISECONDS}ms`,
    );
    this.bubble.style.setProperty(
      "--tooltip-close-duration",
      `${CLOSE_DURATION_IN_MILLISECONDS}ms`,
    );
    this.bubble.style.setProperty("--tooltip-slide", `${SLIDE_IN_PIXELS}px`);
    this.bubble.style.setProperty(
      "--tooltip-arrow-size",
      `${ARROW_SIZE_IN_PIXELS}px`,
    );
    this.bubble.style.setProperty(
      "--tooltip-window-margin",
      `${WINDOW_MARGIN_IN_PIXELS}px`,
    );

    this.box.className = "tooltip-box";
    this.box.classList.toggle("align-center", options.centered === true);
    this.bubble.append(this.box);

    this.setContent(options.content);
  }

  get isOpen(): boolean {
    return this.bubble.matches(":popover-open");
  }

  /** Whether the tooltip is still fading out after it was closed. */
  get isClosing(): boolean {
    return this.closingTimeout !== undefined;
  }

  setContent(content: Node | string): void {
    this.content = content;
    if (typeof content === "string") {
      // The client builds tooltip HTML itself and escapes anything that users wrote.
      // eslint-disable-next-line unicorn/no-unsafe-dom-html
      this.box.innerHTML = content;
    } else {
      this.box.replaceChildren(content);
    }

    if (this.isOpen) {
      this.position();
    }
  }

  /**
   * Opens the tooltip, or moves it to its anchor if it is already open. Empty tooltips stay shut.
   */
  open(): void {
    if (this.content === "") {
      return;
    }

    clearTimeout(this.closingTimeout);
    this.closingTimeout = undefined;
    if (!this.bubble.isConnected) {
      document.body.append(this.bubble);
    }

    if (!this.isOpen) {
      this.bubble.showPopover();
      this.anchorCheckInterval = setInterval(() => {
        if (!this.anchor.isConnected) {
          this.close();
        }
      }, ANCHOR_CHECK_INTERVAL_IN_MILLISECONDS);
    }
    this.position();
  }

  /** Opens the tooltip until the next click outside of the anchor and the tooltip. */
  openUntilClickElsewhere(): void {
    this.open();
    document.addEventListener("pointerdown", this.closeOnPointerDownElsewhere, {
      capture: true,
    });
  }

  close(): void {
    document.removeEventListener(
      "pointerdown",
      this.closeOnPointerDownElsewhere,
      { capture: true },
    );
    clearInterval(this.anchorCheckInterval);
    this.anchorCheckInterval = undefined;
    if (!this.isOpen) {
      return;
    }

    this.bubble.hidePopover();
    this.closingTimeout = setTimeout(() => {
      this.closingTimeout = undefined;
      this.bubble.remove();
    }, CLOSE_DURATION_IN_MILLISECONDS);
  }

  /**
   * Opens the tooltip while a mouse is over the anchor. A tap on a touch screen opens it until the
   * next tap elsewhere.
   */
  openOnHover(): void {
    const { signal } = this.hoverListeners;
    this.anchor.addEventListener(
      "pointerenter",
      (event) => {
        if (event.pointerType !== "touch") {
          this.open();
        }
      },
      { signal },
    );
    this.anchor.addEventListener(
      "pointerleave",
      (event) => {
        if (event.pointerType !== "touch") {
          this.close();
        }
      },
      { signal },
    );
    this.anchor.addEventListener(
      "click",
      (event) => {
        if (event.pointerType !== "touch") {
          return;
        }
        if (this.isOpen) {
          this.close();
        } else {
          this.openUntilClickElsewhere();
        }
      },
      { signal },
    );
  }

  destroy(): void {
    this.hoverListeners.abort();
    this.close();
    clearTimeout(this.closingTimeout);
    this.closingTimeout = undefined;
    this.bubble.remove();
  }

  private readonly closeOnPointerDownElsewhere = (event: PointerEvent) => {
    const { target } = event;
    if (!(
      target instanceof Node
      && (this.anchor.contains(target) || this.bubble.contains(target))
    )) {
      this.close();
    }
  };

  private position() {
    // Measure the tooltip at the corner of the window, where the window's edge does not wrap it.
    this.bubble.style.left = "0px";
    this.bubble.style.top = "0px";
    const anchor = this.anchor.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = this.bubble;

    const fitsAbove = anchor.top - height >= WINDOW_MARGIN_IN_PIXELS;
    const fitsBelow =
      anchor.bottom + height <= window.innerHeight - WINDOW_MARGIN_IN_PIXELS;
    const side = this.side ?? (!fitsAbove && fitsBelow ? "bottom" : "top");
    this.bubble.dataset["side"] = side;

    const center = anchor.left + anchor.width / 2;
    const maxLeft = window.innerWidth - WINDOW_MARGIN_IN_PIXELS - width;
    const left = Math.max(
      WINDOW_MARGIN_IN_PIXELS,
      Math.min(center - width / 2, maxLeft),
    );
    const top = side === "top" ? anchor.top - height : anchor.bottom;

    this.bubble.style.left = `${left}px`;
    this.bubble.style.top = `${top}px`;
    this.bubble.style.setProperty("--tooltip-arrow-x", `${center - left}px`);
  }
}

/**
 * Creates a tooltip that opens on hover, showing the element that the anchor's
 * "data-tooltip-content" attribute selects.
 */
export function hoverTooltip(anchor: HTMLElement): Tooltip {
  const selector = anchor.dataset["tooltipContent"];
  const content =
    selector === undefined ? null : document.querySelector(selector);
  if (content === null) {
    throw new Error(
      `The "data-tooltip-content" attribute of the tooltip anchor "#${anchor.id}" does not select an element.`,
    );
  }

  const tooltip = new Tooltip(anchor, { content });
  tooltip.openOnHover();
  return tooltip;
}
