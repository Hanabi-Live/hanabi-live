// A large ">>" or "<<" in the middle of the table, which flashes on each move of the shared replay
// leader, as on the classic screen. A spectator who follows the leader sees which way they went.

import { useLayoutEffect, useRef, useState } from "react";
import type { State } from "../types/State.ts";

/** How long the arrows show, from popping in to fading out, in milliseconds. */
const FLASH_MILLISECONDS = 1000;

/** How long the arrows take to pop in, in milliseconds. */
const POP_MILLISECONDS = 180;

/** When the arrows start to fade out, in milliseconds. */
const FADE_DELAY_MILLISECONDS = 350;

/** How far the arrows drift the way that the leader went, as a fraction of their width. */
const DRIFT_FRACTION = 0.08;

/** An overshoot, so that the arrows pop in. */
const EASE_OUT_BACK = "cubic-bezier(0.34, 1.56, 0.64, 1)";

/** A move of the shared replay leader, to a later turn or an earlier one. */
interface LeaderMove {
  readonly direction: 1 | -1;

  /** Counts the moves, so that each one flashes, even in the same direction as the last. */
  readonly key: number;
}

export function LeaderDirection({
  state,
}: {
  readonly state: State;
}): React.JSX.Element | null {
  const { shared } = state.replay;
  // While we follow someone else's lead, the turn moves without us. Going back to the leader's turn
  // is not one of their moves.
  const following =
    shared !== undefined && shared.useSharedSegments && !shared.amLeader;
  const move = useLeaderMove(following, shared?.segment);

  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const arrows = ref.current;
    if (arrows === null || move === undefined) {
      return undefined;
    }
    const drift = `${move.direction * DRIFT_FRACTION * 100}%`;
    // They pop in, hold still for a moment, and then drift the way that the leader went as they
    // fade out.
    const animation = arrows.animate(
      [
        {
          opacity: 0,
          transform: "translateX(0) scale(0.6)",
          easing: EASE_OUT_BACK,
        },
        {
          opacity: 1,
          transform: "translateX(0) scale(1)",
          offset: POP_MILLISECONDS / FLASH_MILLISECONDS,
        },
        {
          opacity: 1,
          transform: "translateX(0) scale(1)",
          offset: FADE_DELAY_MILLISECONDS / FLASH_MILLISECONDS,
          easing: "ease-in",
        },
        {
          opacity: 0,
          transform: `translateX(${drift}) scale(1)`,
        },
      ],
      {
        duration: FLASH_MILLISECONDS,
        fill: "forwards",
      },
    );
    return () => {
      animation.cancel();
    };
  }, [move]);

  if (move === undefined) {
    return null;
  }

  // Two separate triangles, so that each one has its own outline. The back arrows are the same
  // shape, turned around.
  return (
    <div className="tw:pointer-events-none tw:absolute tw:inset-0 tw:z-30 tw:flex tw:items-center tw:justify-center">
      <svg
        aria-hidden="true"
        className="tw:w-[min(28vmin,200px)] tw:opacity-0 tw:drop-shadow-[0_2px_10px_rgb(0_0_0/0.6)]"
        data-leader-direction
        key={move.key}
        ref={ref}
        viewBox="0 0 100 80"
      >
        <g
          fill="white"
          paintOrder="stroke"
          stroke="rgb(0 0 0 / 0.6)"
          strokeLinejoin="round"
          strokeWidth={6}
          transform={
            move.direction === -1 ? "translate(100 0) scale(-1 1)" : undefined
          }
        >
          <path d="M8 8 L46 40 L8 72 Z" />
          <path d="M54 8 L92 40 L54 72 Z" />
        </g>
      </svg>
    </div>
  );
}

/**
 * The shared replay leader's last move, while we follow them. It is undefined until they move, and
 * again after we stop following them.
 */
function useLeaderMove(
  following: boolean,
  segment: number | undefined,
): LeaderMove | undefined {
  const [previous, setPrevious] = useState({
    following,
    segment,
  });
  const [move, setMove] = useState<LeaderMove>();
  if (previous.following !== following || previous.segment !== segment) {
    setPrevious({
      following,
      segment,
    });
    if (
      following
      && segment !== undefined
      && previous.following
      && previous.segment !== undefined
    ) {
      setMove({
        direction: segment > previous.segment ? 1 : -1,
        key: (move?.key ?? 0) + 1,
      });
    } else if (move !== undefined) {
      setMove(undefined);
    }
  }
  return move;
}
