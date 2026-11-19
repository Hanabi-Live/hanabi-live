// A tooltip that opens beside an anchor element. The bubble is a manual popover, so it is drawn in
// the top layer above every other element, including modals.

import { store } from "./store.ts";
import { getVisibleEdge, pixels } from "./visibleEdge.ts";

/**
 * The height of the arrow that points from the tooltip to its anchor. The arrow is twice as wide as
 * it is high.
 */
export const ARROW_SIZE_IN_PIXELS = 6;

/** The size of the text in a tooltip, relative to the page's text. */
export const FONT_SIZE_IN_EMS = 1.125;

/**
 * The size of the larger text of card notes, which players wrote, relative to the text of the other
 * tooltips.
 */
export const LARGE_TEXT_SCALE = 4 / 3;

/**
 * How long the pointer rests on an element that people click, such as a button, before its tooltip
 * opens. Without it, tooltips would pop up as the pointer passes over a row of buttons.
 */
export const TOOLTIP_DELAY_IN_MILLISECONDS = 500;

/** How long a tooltip takes to fade in. */
export const OPEN_DURATION_IN_MILLISECONDS = 120;

/** How long a tooltip takes to fade out. It is quicker than opening, to get out of the way. */
export const CLOSE_DURATION_IN_MILLISECONDS = 80;

/**
 * How long tooltips take to fade in and out, in milliseconds. With the "Reduced motion" setting,
 * they open and close at once.
 */
function getFadeDurations(): { open: number; close: number } {
  return store.getState().session.settings.reducedMotion
    ? {
        open: 0,
        close: 0,
      }
    : {
        open: OPEN_DURATION_IN_MILLISECONDS,
        close: CLOSE_DURATION_IN_MILLISECONDS,
      };
}

/** How far a tooltip slides toward its anchor as it opens. */
export const SLIDE_IN_PIXELS = 4;

/** The element in the popped-out chat window of the New UI that holds the chat box. */
export const CHAT_WINDOW_ID = "game-chat-window";

/** The redesigned game screen and its chat window, whose tooltips are white. */
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

/**
 * How many callers keep the tooltips of hovered elements shut, such as while the player drags a
 * card over the screen.
 */
let hoverPauses = 0;

/**
 * Closes the tooltips that the pointer opened, and keeps them shut until the returned function
 * runs. Then the tooltip under the pointer opens, as if the pointer had just moved onto it.
 * Tooltips that open on a click, such as a note that the player edits, are not affected.
 */
export function pauseHoverTooltips(): () => void {
  hoverPauses++;
  for (const tooltip of hoveredTooltips) {
    tooltip.close();
  }

  let resumed = false;
  return () => {
    if (resumed) {
      return;
    }

    resumed = true;
    hoverPauses--;
    if (hoverPauses === 0) {
      for (const tooltip of hoveredTooltips) {
        tooltip.openForHover();
      }
    }
  };
}

/** Watches the page for removed anchors while any tooltip is open. */
let anchorObserver: MutationObserver | undefined;

interface TooltipOptions {
  /** HTML, or an element to move into the tooltip. */
  readonly content: Node | string;

  /** Whether the pointer can interact with the content, such as a text box for a note. */
  readonly interactive?: boolean;

  readonly centered?: boolean;

  /**
   * A selector of the element inside the anchor that the arrow points at, such as a card in its
   * slot. The arrow ends at the element's visible edge, which includes its ring and its outline. By
   * default, it points at the anchor.
   */
  readonly target?: string;

  /**
   * Whether the tooltip opens only while the anchor's text is cut off, such as by an ellipsis. Use
   * it for a tooltip that shows the anchor's full text.
   */
  readonly onlyWhenTruncated?: boolean;
}

/** A side of the anchor that a tooltip goes on. */
export type TooltipSide = "top" | "bottom";

export class Tooltip {
  private readonly anchor: HTMLElement;
  private readonly target: string | undefined;
  private readonly onlyWhenTruncated: boolean;
  private readonly bubble = document.createElement("div");
  private readonly box = document.createElement("div");
  private content: Node | string = "";
  /** Whether the box has yet to show `content`, which can wait while the tooltip fades out. */
  private contentPending = false;
  private closingTimeout: ReturnType<typeof setTimeout> | undefined;
  private openingTimeout: ReturnType<typeof setTimeout> | undefined;
  /** Counts the waits for the anchor to stop moving, so that a close ends the last one. */
  private moveWaits = 0;
  /** The next frame in which the tooltip follows its target (see `followTarget`). */
  private followFrame: number | undefined;
  private readonly hoverListeners = new AbortController();
  /** Whether the tooltip waits for the pointer to rest on its anchor (see `openOnHover`). */
  private openOnHoverDelayed = false;
  /** The side of the anchor that the tooltip goes on when it has room there (see `openOnSide`). */
  private side: TooltipSide = "top";
  /** An element that the tooltip goes past when it is on the other side (see `openOnSide`). */
  private avoid: Element | undefined;

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
    this.target = options.target;
    this.onlyWhenTruncated = options.onlyWhenTruncated === true;

    this.bubble.className = "tooltip-bubble";
    this.bubble.popover = "manual";
    this.bubble.classList.toggle(
      "tooltip-interactive",
      options.interactive === true,
    );
    this.bubble.style.setProperty("--tooltip-slide", `${SLIDE_IN_PIXELS}px`);
    this.bubble.style.setProperty(
      "--tooltip-arrow-size",
      `${ARROW_SIZE_IN_PIXELS}px`,
    );
    this.bubble.style.setProperty(
      "--tooltip-font-size",
      `${FONT_SIZE_IN_EMS}em`,
    );
    this.bubble.style.setProperty(
      "--tooltip-large-text-scale",
      LARGE_TEXT_SCALE.toString(),
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
   * Places the tooltip above its anchor, or below it if only that side has room (or the other way
   * around, after `openOnSide`). A tooltip too tall for either side goes on the side with more
   * room, and scrolls.
   */
  private position() {
    // Measure the tooltip at the corner of the window, where the window's edge does not wrap it.
    this.bubble.style.left = "0px";
    this.bubble.style.top = "0px";
    this.bubble.style.removeProperty("--tooltip-room");
    const anchorWindow = this.anchor.ownerDocument.defaultView ?? globalThis;
    const target =
      this.target === undefined
        ? undefined
        : (this.anchor.querySelector(this.target) ?? undefined);
    const targetRect = (target ?? this.anchor).getBoundingClientRect();
    // The tip of the arrow, with the tooltip's border around it, ends at the target's visible edge.
    const gap =
      (target === undefined ? 0 : getVisibleEdge(target))
      + pixels(
        anchorWindow
          .getComputedStyle(this.bubble)
          .getPropertyValue("--tooltip-border-width"),
      );
    const anchor = {
      top: targetRect.top - gap,
      bottom: targetRect.bottom + gap,
      left: targetRect.left,
      width: targetRect.width,
    };
    const { offsetWidth: width } = this.bubble;
    let { offsetHeight: height } = this.bubble;

    const roomAbove = anchor.top - WINDOW_MARGIN_IN_PIXELS;
    const roomBelow =
      anchorWindow.innerHeight - WINDOW_MARGIN_IN_PIXELS - anchor.bottom;
    const roomOnSide = this.side === "top" ? roomAbove : roomBelow;
    const roomAcross = this.side === "top" ? roomBelow : roomAbove;
    const otherSide = this.side === "top" ? "bottom" : "top";
    const side =
      height <= roomOnSide || (height > roomAcross && roomOnSide >= roomAcross)
        ? this.side
        : otherSide;
    this.bubble.dataset["side"] = side;

    // On the other side, the tooltip goes past the element that it avoids, which is there.
    if (side !== this.side && this.avoid?.isConnected === true) {
      const avoided = this.avoid.getBoundingClientRect();
      if (side === "top") {
        anchor.top = Math.min(anchor.top, avoided.top - gap);
      } else {
        anchor.bottom = Math.max(anchor.bottom, avoided.bottom + gap);
      }
    }
    const room =
      side === "top"
        ? anchor.top - WINDOW_MARGIN_IN_PIXELS
        : anchorWindow.innerHeight - WINDOW_MARGIN_IN_PIXELS - anchor.bottom;
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

  /**
   * Moves the tooltip with its target while a transition in the anchor plays, such as a card that
   * lifts under the pointer, so that the arrow stays on it.
   */
  private followTarget() {
    if (this.target === undefined || this.followFrame !== undefined) {
      return;
    }

    const anchorWindow = this.anchor.ownerDocument.defaultView ?? globalThis;
    const follow = () => {
      this.followFrame = undefined;
      if (!this.isOpen) {
        return;
      }
      this.position();
      // Only transitions end. An animation can repeat forever.
      const moving = this.anchor
        .getAnimations({ subtree: true })
        .some(
          (animation) =>
            "transitionProperty" in animation
            && animation.playState === "running",
        );
      if (moving) {
        this.followFrame = anchorWindow.requestAnimationFrame(follow);
      }
    };
    this.followFrame = anchorWindow.requestAnimationFrame(follow);
  }

  /** Puts the content in the box, if it changed since the box last showed it. */
  private showContent() {
    const { content } = this;
    if (!this.contentPending) {
      return;
    }

    this.contentPending = false;
    if (typeof content === "string") {
      // The client builds tooltip HTML itself and escapes anything that users wrote.
      // eslint-disable-next-line unicorn/no-unsafe-dom-html
      this.box.innerHTML = content;
    } else {
      this.box.replaceChildren(content);
    }
  }

  /** Opens the tooltip for the pointer over its anchor, after the wait if it has one. */
  openForHover(): void {
    clearTimeout(this.openingTimeout);
    this.openingTimeout = undefined;
    this.moveWaits++;
    if (hoverPauses > 0) {
      return;
    }
    // An anchor can move under the pointer, such as a played card that starts its move to the play
    // stacks from the slot under the pointer. The tooltip waits until it stops, and opens only if
    // the pointer is still over it.
    const moves = getMoves(this.anchor);
    if (moves.length > 0) {
      const wait = this.moveWaits;
      let movesLeft = moves.length;
      const end = () => {
        movesLeft--;
        if (
          movesLeft === 0
          && wait === this.moveWaits
          && hoveredTooltips.has(this)
          && this.anchor.matches(":hover")
        ) {
          this.openForHover();
        }
      };
      for (const move of moves) {
        move.addEventListener("finish", end, { once: true });
        move.addEventListener("cancel", end, { once: true });
      }
      return;
    }
    if (this.openOnHoverDelayed) {
      this.openingTimeout = setTimeout(() => {
        this.openingTimeout = undefined;
        if (hoverPauses === 0) {
          this.open();
        }
      }, TOOLTIP_DELAY_IN_MILLISECONDS);
    } else {
      this.open();
    }
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

  /**
   * Changes what the tooltip shows. With no content, the tooltip closes. When an empty tooltip gets
   * content while the mouse is over its anchor, it opens again. For example, a card's note shows
   * again when the player lets go of the card that showed its possible cards.
   */
  setContent(content: Node | string): void {
    const wasEmpty = this.content === "";
    this.content = content;
    if (content === "") {
      this.close();
      return;
    }
    this.contentPending = true;
    // The box keeps what it showed while it fades out. Otherwise, the fading bubble would show
    // other content, at the place and size of the old content.
    if (!this.isClosing) {
      this.showContent();
    }

    if (this.isOpen) {
      this.position();
    } else if (
      hoverPauses === 0
      && wasEmpty
      && hoveredTooltips.has(this)
      // A tooltip that waits for the pointer to rest on its anchor opens when the wait ends.
      && this.openingTimeout === undefined
    ) {
      this.open();
    }
  }

  /**
   * Opens the tooltip, or moves it to its anchor if it is already open. Empty tooltips stay shut.
   */
  open(): void {
    if (
      this.content === ""
      || (this.onlyWhenTruncated
        && this.anchor.scrollWidth <= this.anchor.clientWidth)
    ) {
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
    this.showContent();
    if (!this.bubble.isConnected) {
      // The anchor can be in another window, such as the popped-out chat of the New UI.
      this.anchor.ownerDocument.body.append(this.bubble);
    }
    // The tooltips of the redesigned game screen are white, like the paper of its card notes.
    this.bubble.classList.toggle(
      "tooltip-game-screen",
      this.anchor.closest(GAME_SCREEN_SELECTOR) !== null,
    );

    if (!this.isOpen) {
      // The "Reduced motion" setting leaves out the fades. It can change while the page is open.
      const durations = getFadeDurations();
      this.bubble.style.setProperty(
        "--tooltip-open-duration",
        `${durations.open}ms`,
      );
      this.bubble.style.setProperty(
        "--tooltip-close-duration",
        `${durations.close}ms`,
      );
      this.bubble.showPopover();
      watchAnchor(this);
    }
    // While the tooltip is open, the anchor has the "data-tooltip-open" attribute, so that it can
    // show that the tooltip is about it, such as with a frame (the Tailwind variant
    // "data-tooltip-open").
    this.anchor.dataset["tooltipOpen"] = "";
    this.position();
    this.followTarget();
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

  /**
   * Opens the tooltip on a side of its anchor, if it has room there, until it closes. Use it where
   * something else covers the other side, such as a card's bubble of possible cards. Without room,
   * the tooltip goes on the other side, past that element (`avoid`).
   */
  openOnSide(side: TooltipSide, avoid?: Element): void {
    this.side = side;
    this.avoid = avoid;
    this.open();
  }

  close(): void {
    this.side = "top";
    this.avoid = undefined;
    clearTimeout(this.openingTimeout);
    this.openingTimeout = undefined;
    this.moveWaits++;
    this.anchor.ownerDocument.removeEventListener(
      "pointerdown",
      this.closeOnPointerDownElsewhere,
      { capture: true },
    );
    unwatchAnchor(this);
    if (this.followFrame !== undefined) {
      (
        this.anchor.ownerDocument.defaultView ?? globalThis
      ).cancelAnimationFrame(this.followFrame);
      this.followFrame = undefined;
    }
    delete this.anchor.dataset["tooltipOpen"];
    if (!this.isOpen) {
      return;
    }

    this.bubble.hidePopover();
    this.closingTimeout = setTimeout(() => {
      this.closingTimeout = undefined;
      this.bubble.remove();
      this.showContent();
    }, getFadeDurations().close);
  }

  /**
   * Opens the tooltip while a mouse is over the anchor. A tap on a touch screen opens it until the
   * next tap elsewhere.
   *
   * @param delayed Whether the tooltip waits for the pointer to rest on the anchor before it opens.
   *                Use it for an anchor that people click, such as a button. A tooltip that only
   *                explains something, such as that of an info icon, opens at once.
   * @param tapOpens Whether a tap opens the tooltip. Turn it off for an anchor where a tap does
   *                 something else, such as a card that opens a menu.
   */
  openOnHover(delayed: boolean, tapOpens = true): void {
    const { signal } = this.hoverListeners;
    this.anchor.addEventListener(
      "pointerenter",
      (event) => {
        if (event.pointerType === "touch") {
          return;
        }
        hoveredTooltips.add(this);
        this.openOnHoverDelayed = delayed;
        this.openForHover();
      },
      { signal },
    );
    this.anchor.addEventListener(
      "pointerleave",
      (event) => {
        if (event.pointerType === "touch") {
          return;
        }

        hoveredTooltips.delete(this);
        this.close();
        // An outer tooltip stays shut while the pointer is over this one. The pointer can leave
        // this anchor without leaving the outer one, such as from one box of a row to the next, so
        // the outer tooltip opens now.
        for (const tooltip of hoveredTooltips) {
          if (tooltip.anchor.contains(this.anchor)) {
            tooltip.openForHover();
          }
        }
      },
      { signal },
    );
    this.anchor.addEventListener(
      "click",
      (event) => {
        if (!tapOpens || event.pointerType !== "touch") {
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
    // An open tooltip fades out, as when it closes, and then goes. Its anchor can already be gone,
    // such as a button that a click removed.
    this.close();
    if (!this.isClosing) {
      this.bubble.remove();
    }
  }
}

/**
 * Returns the animations that move an anchor now: the scripted animations of its transform on the
 * anchor or an element around it, which end. A CSS transition, such as a card that lifts under the
 * pointer, does not count.
 */
function getMoves(anchor: HTMLElement): readonly Animation[] {
  // The anchor can be in another window, such as the popped-out chat of the New UI.
  const anchorWindow = anchor.ownerDocument.defaultView ?? globalThis;
  return anchor.ownerDocument.getAnimations().filter((animation) => {
    const { effect } = animation;
    return (
      animation.playState === "running"
      && !("transitionProperty" in animation)
      && !("animationName" in animation)
      && effect instanceof anchorWindow.KeyframeEffect
      && effect.target?.contains(anchor) === true
      && Number.isFinite(effect.getComputedTiming().endTime)
      && effect
        .getKeyframes()
        .some((keyframe) => "transform" in keyframe || "translate" in keyframe)
    );
  });
}

function watchAnchor(tooltip: Tooltip) {
  openTooltips.add(tooltip);
  if (anchorObserver !== undefined) {
    return;
  }

  anchorObserver = new MutationObserver(closeTooltipsOfRemovedAnchors);
  anchorObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function unwatchAnchor(tooltip: Tooltip) {
  openTooltips.delete(tooltip);
  if (openTooltips.size > 0) {
    return;
  }

  anchorObserver?.disconnect();
  anchorObserver = undefined;
}

function closeTooltipsOfRemovedAnchors() {
  for (const tooltip of openTooltips) {
    if (!tooltip.isAnchorConnected) {
      tooltip.close();
    }
  }
}
