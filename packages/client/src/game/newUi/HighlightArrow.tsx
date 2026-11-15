// The highlight arrow: a yellow arrow that points at a card or at a part of the board (see
// "arrow.ts").

import type { CardState } from "@hanabi-live/game";
import type { RefObject } from "react";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { ArrowTarget } from "../highlightArrow.ts";
import { findArrowAnchor, measureArrowAnchor } from "./arrowAnchor.ts";
import { getScreenScale } from "./screenScale.ts";

/** The size of the arrow's box, in the screen's CSS pixels. Its outline fits inside it. */
const ARROW_WIDTH = 38;
const ARROW_HEIGHT = 50;

/** The point of the arrow, in its box. */
const ARROW_TIP = {
  x: 19,
  y: 47,
} as const;

/**
 * The shaft and the head as one shape, so that its outline goes around both, without a line where
 * they meet. It points down. The view box leaves room for the outline.
 */
const ARROW_PATH = "M10 0 H24 V22 H34 L17 45 L0 22 H10 Z";
const ARROW_VIEW_BOX = "-2 -2 38 50";

/** How far the point goes into a card, as a fraction of the card's height. */
const CARD_TIP_INSET = 0.12;

/** The space between the point and a number or a token, in the screen's CSS pixels. */
const TIP_GAP = 2;

/** The least space between the arrow and the top of the screen, in the screen's CSS pixels. */
const SCREEN_EDGE_MARGIN = 4;

/** How long the arrow takes to drop into place when it appears, in milliseconds. */
const APPEAR_MILLISECONDS = 280;

/**
 * Whether the middle of the target is scrolled out of a box that it scrolls in, such as the table
 * on a narrow window. The arrow would then point at the bar along the bottom of the screen instead.
 */
function isScrolledAway(
  anchor: Element,
  root: Element,
  rect: DOMRect,
): boolean {
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  for (
    let box = anchor.parentElement;
    box !== null && box !== root;
    box = box.parentElement
  ) {
    const { overflowX, overflowY } = getComputedStyle(box);
    if (overflowX === "visible" && overflowY === "visible") {
      continue;
    }
    const boxRect = box.getBoundingClientRect();
    if (
      x < boxRect.left
      || x > boxRect.right
      || y < boxRect.top
      || y > boxRect.bottom
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Places the arrow over its target, where the target is now. The arrow points down at the top of
 * the target. When there is no room above it, the arrow points up at its bottom instead.
 */
function placeArrow(
  arrow: HTMLElement,
  root: HTMLElement,
  target: ArrowTarget,
  deck: readonly CardState[],
) {
  const anchor = findArrowAnchor(root, target, deck);
  const rect =
    anchor === undefined ? undefined : measureArrowAnchor(anchor, target);
  if (
    anchor === undefined
    || rect === undefined
    || (rect.width === 0 && rect.height === 0)
    || isScrolledAway(anchor, root, rect)
  ) {
    arrow.style.visibility = "hidden";
    return;
  }

  const scale = getScreenScale();
  const rootRect = root.getBoundingClientRect();
  const left = (rect.left - rootRect.left) / scale;
  const top = (rect.top - rootRect.top) / scale;
  const width = rect.width / scale;
  const height = rect.height / scale;
  const inset = typeof target === "number" ? height * CARD_TIP_INSET : -TIP_GAP;
  const down = top + inset - ARROW_TIP.y >= SCREEN_EDGE_MARGIN;
  const tipX = left + width / 2;
  const tipY = down ? top + inset : top + height - inset;
  arrow.style.visibility = "visible";
  arrow.style.transform = `translate(${tipX - ARROW_TIP.x}px, ${tipY - ARROW_TIP.y}px) rotate(${down ? 0 : 180}deg)`;
}

/**
 * The arrow follows its target as the screen changes, such as when a hand closes the gap of a
 * played card, or the window changes size. When it appears, it drops onto its target. With "Reduced
 * motion", it appears in place.
 */
export function HighlightArrow({
  root,
  target,
  deck,
  reducedMotion,
}: {
  readonly root: RefObject<HTMLElement | null>;
  readonly target: ArrowTarget;
  readonly deck: readonly CardState[];
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const arrowRef = useRef<HTMLDivElement>(null);
  const shapeRef = useRef<SVGSVGElement>(null);
  const deckRef = useRef(deck);
  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  // The target moves without telling the arrow, as cards slide and the layout changes, so the arrow
  // measures it on each frame.
  useLayoutEffect(() => {
    let frame = 0;
    function follow() {
      const arrow = arrowRef.current;
      const rootElement = root.current;
      if (arrow !== null && rootElement !== null) {
        placeArrow(arrow, rootElement, target, deckRef.current);
      }
      frame = requestAnimationFrame(follow);
    }
    follow();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [root, target]);

  useLayoutEffect(() => {
    const shape = shapeRef.current;
    if (shape === null || reducedMotion) {
      return undefined;
    }
    // It drops toward the target, overshoots a little, and settles.
    const drop = shape.animate(
      [
        {
          opacity: 0,
          transform: "translateY(-18px) scale(0.8)",
        },
        {
          opacity: 1,
          transform: "translateY(3px) scale(1.04)",
          offset: 0.6,
        },
        {
          opacity: 1,
          transform: "none",
        },
      ],
      {
        duration: APPEAR_MILLISECONDS,
        easing: "cubic-bezier(0.2, 0.8, 0.3, 1)",
      },
    );
    return () => {
      drop.cancel();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="tw:pointer-events-none tw:invisible tw:absolute tw:top-0 tw:left-0 tw:z-30"
      data-highlight-arrow
      ref={arrowRef}
      style={{
        width: ARROW_WIDTH,
        height: ARROW_HEIGHT,
        transformOrigin: `${ARROW_TIP.x}px ${ARROW_TIP.y}px`,
      }}
    >
      <svg
        className="tw:block tw:drop-shadow-[0_2px_3px_rgb(0_0_0/0.5)]"
        height={ARROW_HEIGHT}
        ref={shapeRef}
        style={{ transformOrigin: `${ARROW_TIP.x}px ${ARROW_TIP.y}px` }}
        viewBox={ARROW_VIEW_BOX}
        width={ARROW_WIDTH}
      >
        <path
          d={ARROW_PATH}
          fill="var(--game-screen-arrow)"
          paintOrder="stroke"
          stroke="var(--card-ink)"
          strokeLinejoin="round"
          strokeWidth={4}
        />
      </svg>
    </div>
  );
}
