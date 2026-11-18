import { useEffect, useLayoutEffect, useRef } from "react";
import { CLOSE_DURATION_IN_MILLISECONDS } from "../../Tooltip.ts";
import { fadeOutCopy } from "./motion.ts";

/**
 * How long the mark waits before it shows. Most moves arrive sooner, so that the mark does not
 * flash on every move.
 */
const SHOW_DELAY_MILLISECONDS = 150;

/** How long the mark takes to fade in. */
const FADE_IN_MILLISECONDS = 120;

/** The time between two ripples, as on the classic screen. */
const RIPPLE_PERIOD_MILLISECONDS = 1000;

/** The gap between the mark's ring and the thing that it surrounds, in CSS pixels. */
const RING_GAP = 3;

/** How far a ripple spreads out from the ring, in CSS pixels. */
const RIPPLE_SPREAD = 12;

/**
 * Shows that the player's move went to the server and waits for it there, as the classic screen
 * does with its rings over the clue area. It surrounds the place where the player acted: the card
 * that they played or discarded, or the hand that gets their clue. A ring and a label stay until
 * the move arrives, and ripples spread out from the ring, like a signal that goes out.
 *
 * The parent must be positioned, and the mark covers it.
 */
export function SendingMark({
  radius,
  label,
  labelEdge,
  reducedMotion,
}: {
  /** The corner radius of the thing that the mark surrounds, in CSS pixels. */
  readonly radius: number;
  /** What the label says, such as "Sending your clue". */
  readonly label: string;
  /** The edge on which the label sits, so that it covers the least. */
  readonly labelEdge: "top" | "bottom";
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const markRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLDivElement>(null);

  // The mark shows only if the move takes a moment. The fade is left out with reduced motion, but
  // the wait is not, since it is not movement.
  useEffect(() => {
    const mark = markRef.current;
    if (mark === null) {
      return undefined;
    }
    const animation = mark.animate([{ opacity: 0 }, { opacity: 1 }], {
      delay: SHOW_DELAY_MILLISECONDS,
      duration: reducedMotion ? 0 : FADE_IN_MILLISECONDS,
      fill: "backwards",
    });
    return () => {
      animation.cancel();
    };
  }, [reducedMotion]);

  // When the move arrives, or the server refuses it, a copy of the mark fades out (see
  // `fadeOutCopy`). A mark that has not shown yet goes at once.
  useLayoutEffect(() => {
    const mark = markRef.current;
    if (mark === null || reducedMotion) {
      return undefined;
    }
    return () => {
      const shown = Number(getComputedStyle(mark).opacity);
      if (shown > 0) {
        fadeOutCopy(mark, [{ opacity: shown }, { opacity: 0 }], {
          duration: CLOSE_DURATION_IN_MILLISECONDS,
          easing: "ease-in",
        });
      }
    };
  }, [reducedMotion]);

  // The ripples only decorate the ring, which shows the wait by itself.
  useEffect(() => {
    const ripple = rippleRef.current;
    if (ripple === null || reducedMotion) {
      return undefined;
    }
    const animation = ripple.animate(
      [
        {
          boxShadow: "0 0 0 0 var(--game-screen-text)",
          opacity: 0.8,
        },
        {
          boxShadow: `0 0 0 ${RIPPLE_SPREAD}px var(--game-screen-text)`,
          opacity: 0,
        },
      ],
      {
        duration: RIPPLE_PERIOD_MILLISECONDS,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        iterations: Infinity,
      },
    );
    return () => {
      animation.cancel();
    };
  }, [reducedMotion]);

  const ringStyle = {
    inset: -RING_GAP,
    borderRadius: radius + RING_GAP,
  };

  return (
    <div
      aria-label={label}
      className="tw:pointer-events-none tw:absolute tw:inset-0 tw:z-20"
      data-sending-mark
      ref={markRef}
      role="status"
    >
      {/* A dark edge outside the ring keeps it clear on the light parts of a card. */}
      <div
        className="tw:absolute tw:shadow-[0_0_0_2px_var(--game-screen-text),0_0_0_3px_rgb(0_0_0/55%)]"
        style={ringStyle}
      />
      {!reducedMotion && (
        <div className="tw:absolute" ref={rippleRef} style={ringStyle} />
      )}
      <span
        className={`tw:absolute tw:left-1/2 tw:-translate-x-1/2 tw:rounded-full tw:bg-game-panel tw:px-2.5 tw:py-1 tw:text-[12px] tw:leading-none tw:font-semibold tw:whitespace-nowrap tw:text-game-text tw:shadow-[0_2px_8px_rgb(0_0_0/45%)] tw:ring-1 tw:ring-game-line ${
          labelEdge === "top"
            ? "tw:top-0 tw:-translate-y-1/2"
            : "tw:bottom-0 tw:translate-y-1/2"
        }`}
        style={labelEdge === "top" ? { top: -RING_GAP } : { bottom: -RING_GAP }}
      >
        Sending...
      </span>
    </div>
  );
}
