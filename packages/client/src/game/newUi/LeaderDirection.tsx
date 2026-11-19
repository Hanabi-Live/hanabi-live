// A large ">>" or "<<" in the middle of the table, which flashes on each move of the shared replay
// leader, as on the classic screen. A spectator who follows the leader sees which way they went.

import { useLayoutEffect, useRef, useState } from "react";
import { store } from "../../store.ts";
import { CLOSE_DURATION_IN_MILLISECONDS } from "../../Tooltip.ts";
import type { State } from "../types/State.ts";
import { fadeOutCopy } from "./motion.ts";

/** How long the arrows take to fade out, in milliseconds, as on the classic screen. */
const FADE_MILLISECONDS = 1000;

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

  return (
    // The box stays without arrows, so that arrows that go can fade out in it.
    <div className="tw:pointer-events-none tw:absolute tw:inset-0 tw:z-30 tw:flex tw:items-center tw:justify-center">
      {move !== undefined && (
        <LeaderArrows direction={move.direction} key={move.key} />
      )}
    </div>
  );
}

/** The arrows of one move of the leader. They flash once. */
function LeaderArrows({
  direction,
}: {
  readonly direction: 1 | -1;
}): React.JSX.Element {
  const ref = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const arrows = ref.current;
    if (arrows === null) {
      return undefined;
    }
    // They show at once and fade out where they are, as on the classic screen. The fade starts
    // slowly, so that they stay easy to see for longer.
    const animation = arrows.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_MILLISECONDS,
      easing: "ease-in",
      fill: "forwards",
    });
    // Arrows that go during their flash, such as when the viewer stops following the leader, fade
    // out from where they are (see `fadeOutCopy`). This cleanup runs while they are still on the
    // page, because it belongs to the component that React removes.
    return () => {
      const shown = Number(getComputedStyle(arrows).opacity);
      animation.cancel();
      if (!(shown > 0) || store.getState().session.settings.reducedMotion) {
        return;
      }

      arrows.style.opacity = String(shown);
      fadeOutCopy(arrows, [{ opacity: shown }, { opacity: 0 }], {
        duration: CLOSE_DURATION_IN_MILLISECONDS,
        easing: "ease-in",
      });
      arrows.style.opacity = "";
    };
  }, [direction]);

  // Two separate triangles, so that each one has its own outline. The back arrows are the same
  // shape, turned around.
  return (
    <svg
      aria-hidden="true"
      className="tw:w-[min(28vmin,200px)] tw:opacity-0 tw:drop-shadow-[0_2px_10px_rgb(0_0_0/0.6)]"
      data-leader-direction
      ref={ref}
      viewBox="0 0 100 56"
    >
      <g
        fill="white"
        paintOrder="stroke"
        stroke="rgb(0 0 0 / 0.6)"
        strokeLinejoin="round"
        strokeWidth={6}
        transform={
          direction === -1 ? "translate(100 0) scale(-1 1)" : undefined
        }
      >
        <path d="M8 8 L46 28 L8 48 Z" />
        <path d="M54 8 L92 28 L54 48 Z" />
      </g>
    </svg>
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
