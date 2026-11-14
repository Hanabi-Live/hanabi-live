// A tooltip that opens beside an anchor element. The bubble is a manual popover, so it is drawn in
// the top layer above every other element, including modals.

/** The height of the arrow that points from the tooltip to its anchor. */
const ARROW_SIZE_IN_PIXELS = 6;

/**
 * How long the pointer rests on an element that people click, such as a button, before its tooltip
 * opens. Without it, tooltips would pop up as the pointer passes over a row of buttons.
 */
export const TOOLTIP_DELAY_IN_MILLISECONDS = 500;

/** How long a tooltip takes to fade in. */
const OPEN_DURATION_IN_MILLISECONDS = 120;

/** How long a tooltip takes to fade out. It is quicker than opening, to get out of the way. */
const CLOSE_DURATION_IN_MILLISECONDS = 80;

/** How far a tooltip slides toward its anchor as it opens. */
const SLIDE_IN_PIXELS = 4;

/** The element in the popped-out chat window of the New UI that holds the chat box. */
export const CHAT_WINDOW_ID = "game-chat-window";

/** The redesigned game screen and its chat window, whose tooltips are white in both themes. */
const GAME_SCREEN_SELECTOR = `#game-new-ui, #${CHAT_WINDOW_ID}`;

/** The closest that a tooltip comes to the edge of the window. */
const WINDOW_MARGIN_IN_PIXELS = 8;

/** The open tooltips, which close when their anchor is removed from the page. */
const openTooltips = new Set<Tooltip>();

/**
 * The tooltips whose anchors the mouse is over, including those that wait to open. An outer
 * tooltip, such as that of a panel, stays shut while the mouse is over an element inside it with
 * its own tooltip.
 */
const hoveredTooltips = new Set<Tooltip>();

/** Watches the page for removed anchors while any tooltip is open. */
let anchorObserver: MutationObserver | undefined;

interface TooltipOptions {
  /** HTML, or an element to move into the tooltip. */
  readonly content: Node | string;

  /** Whether the pointer can interact with the content, such as a text box for a note. */
  readonly interactive?: boolean;

  readonly centered?: boolean;
}

export class Tooltip {
  private readonly anchor: HTMLElement;
  private readonly bubble = document.createElement("div");
  private readonly box = document.createElement("div");
  private content: Node | string = "";
  private closingTimeout: ReturnType<typeof setTimeout> | undefined;
  private openingTimeout: ReturnType<typeof setTimeout> | undefined;
  private readonly hoverListeners = new AbortController();

  private readonly closeOnPointerDownElsewhere = (event: PointerEvent) => {
    const { target } = event;
    if (!(
      target instanceof Node
      && (this.anchor.contains(target) || this.bubble.contains(target))
    )) {
      this.close();
    }
  };

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

  /**
   * Places the tooltip above its anchor, or below it if only that side has room. A tooltip too tall
   * for either side goes on the side with more room, and scrolls.
   */
  private position() {
    // Measure the tooltip at the corner of the window, where the window's edge does not wrap it.
    this.bubble.style.left = "0px";
    this.bubble.style.top = "0px";
    this.bubble.style.removeProperty("--tooltip-room");
    const anchor = this.anchor.getBoundingClientRect();
    const anchorWindow = this.anchor.ownerDocument.defaultView ?? globalThis;
    const { offsetWidth: width } = this.bubble;
    let { offsetHeight: height } = this.bubble;

    const roomAbove = anchor.top - WINDOW_MARGIN_IN_PIXELS;
    const roomBelow =
      anchorWindow.innerHeight - WINDOW_MARGIN_IN_PIXELS - anchor.bottom;
    const side =
      height <= roomAbove || (height > roomBelow && roomAbove >= roomBelow)
        ? "top"
        : "bottom";
    this.bubble.dataset["side"] = side;

    const room = side === "top" ? roomAbove : roomBelow;
    if (height > room) {
      this.bubble.style.setProperty("--tooltip-room", `${room}px`);
      height = this.bubble.offsetHeight;
    }

    const center = anchor.left + anchor.width / 2;
    const maxLeft = anchorWindow.innerWidth - WINDOW_MARGIN_IN_PIXELS - width;
    const left = Math.max(
      WINDOW_MARGIN_IN_PIXELS,
      Math.min(center - width / 2, maxLeft),
    );
    const top = side === "top" ? anchor.top - height : anchor.bottom;

    this.bubble.style.left = `${left}px`;
    this.bubble.style.top = `${top}px`;
    this.bubble.style.setProperty("--tooltip-arrow-x", `${center - left}px`);
  }

  get isOpen(): boolean {
    return this.bubble.matches(":popover-open");
  }

  get isAnchorConnected(): boolean {
    return this.anchor.isConnected;
  }

  /** Whether the tooltip is still fading out after it was closed. */
  get isClosing(): boolean {
    return this.closingTimeout !== undefined;
  }

  /** Changes what the tooltip shows. With no content, the tooltip closes. */
  setContent(content: Node | string): void {
    this.content = content;
    if (content === "") {
      this.close();
    }
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
    // Only the innermost of nested tooltips shows, such as that of a card's note in the discard
    // pile, and not that of the pile.
    for (const tooltip of [...openTooltips, ...hoveredTooltips]) {
      if (
        tooltip !== this
        && tooltip.content !== ""
        && this.anchor.contains(tooltip.anchor)
      ) {
        return;
      }
    }
    for (const tooltip of openTooltips) {
      if (tooltip !== this && tooltip.anchor.contains(this.anchor)) {
        tooltip.close();
      }
    }

    clearTimeout(this.closingTimeout);
    this.closingTimeout = undefined;
    if (!this.bubble.isConnected) {
      // The anchor can be in another window, such as the popped-out chat of the New UI.
      this.anchor.ownerDocument.body.append(this.bubble);
    }
    // The redesigned game screen looks the same in both themes, so its tooltips are white in both.
    this.bubble.classList.toggle(
      "tooltip-game-screen",
      this.anchor.closest(GAME_SCREEN_SELECTOR) !== null,
    );

    if (!this.isOpen) {
      this.bubble.showPopover();
      watchAnchor(this);
    }
    this.position();
  }

  /** Opens the tooltip until the next click outside of the anchor and the tooltip. */
  openUntilClickElsewhere(): void {
    this.open();
    this.anchor.ownerDocument.addEventListener(
      "pointerdown",
      this.closeOnPointerDownElsewhere,
      { capture: true },
    );
  }

  close(): void {
    clearTimeout(this.openingTimeout);
    this.openingTimeout = undefined;
    this.anchor.ownerDocument.removeEventListener(
      "pointerdown",
      this.closeOnPointerDownElsewhere,
      { capture: true },
    );
    unwatchAnchor(this);
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
   *
   * @param delayed Whether the tooltip waits for the pointer to rest on the anchor before it opens.
   *                Use it for an anchor that people click, such as a button. A tooltip that only
   *                explains something, such as that of an info icon, opens at once.
   */
  openOnHover(delayed: boolean): void {
    const { signal } = this.hoverListeners;
    this.anchor.addEventListener(
      "pointerenter",
      (event) => {
        if (event.pointerType === "touch") {
          return;
        }
        hoveredTooltips.add(this);
        if (delayed) {
          clearTimeout(this.openingTimeout);
          this.openingTimeout = setTimeout(() => {
            this.openingTimeout = undefined;
            this.open();
          }, TOOLTIP_DELAY_IN_MILLISECONDS);
        } else {
          this.open();
        }
      },
      { signal },
    );
    this.anchor.addEventListener(
      "pointerleave",
      (event) => {
        if (event.pointerType !== "touch") {
          hoveredTooltips.delete(this);
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
    hoveredTooltips.delete(this);
    this.close();
    clearTimeout(this.closingTimeout);
    this.closingTimeout = undefined;
    this.bubble.remove();
  }
}

function watchAnchor(tooltip: Tooltip) {
  openTooltips.add(tooltip);
  if (anchorObserver === undefined) {
    anchorObserver = new MutationObserver(closeTooltipsOfRemovedAnchors);
    anchorObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}

function unwatchAnchor(tooltip: Tooltip) {
  openTooltips.delete(tooltip);
  if (openTooltips.size === 0) {
    anchorObserver?.disconnect();
    anchorObserver = undefined;
  }
}

function closeTooltipsOfRemovedAnchors() {
  for (const tooltip of openTooltips) {
    if (!tooltip.isAnchorConnected) {
      tooltip.close();
    }
  }
}
