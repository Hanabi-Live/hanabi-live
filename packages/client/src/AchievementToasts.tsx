// The toasts at the top of the window that tell the player about an achievement that they just
// unlocked. Each one drops in, stays for `TOAST_TIME_MS` (longer while the pointer is on it), and
// fades out. A click closes it early. The "Reduced motion" setting leaves out the drop and the
// fade.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { AchievementToast } from "./achievementToastSlice.ts";
import { achievementToastClosed } from "./achievementToastSlice.ts";
import { useReducedMotion } from "./fade.ts";
import { AchievementArt } from "./publicPages/Achievements.tsx";
import { store, useAppSelector } from "./store.ts";

/** How long a toast stays, in milliseconds. */
const TOAST_TIME_MS = 6000;

/** How long a toast takes to drop in, in milliseconds. */
const DROP_TIME_MS = 420;

/** How long a toast takes to fade out, in milliseconds. */
const CLOSE_TIME_MS = 220;

/** An ease that goes a little past its end and settles, so that the toast lands. */
const LANDING_EASE = "cubic-bezier(0.34, 1.56, 0.64, 1)";

export function AchievementToasts(): React.JSX.Element {
  const toasts = useAppSelector((state) => state.achievementToast.toasts);
  return (
    <div
      aria-live="polite"
      className="tw:pointer-events-none tw:fixed tw:top-3 tw:left-1/2 tw:z-[calc(var(--z-header)+1)] tw:flex tw:w-[min(24em,calc(100vw-2em))] tw:-translate-x-1/2 tw:flex-col tw:gap-2"
      role="status"
    >
      {toasts.map((toast) => (
        <Toast key={toast.key} toast={toast} />
      ))}
    </div>
  );
}

function Toast({
  toast,
}: {
  readonly toast: AchievementToast;
}): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const element = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [closing, setClosing] = useState(false);
  const { achievement } = toast;

  const close = useCallback(() => {
    setClosing(true);
  }, []);

  useLayoutEffect(() => {
    if (reducedMotion) {
      return;
    }
    element.current?.animate(
      [
        {
          transform: "translateY(-140%)",
          opacity: 0,
        },
        {
          transform: "translateY(0)",
          opacity: 1,
        },
      ],
      {
        duration: DROP_TIME_MS,
        easing: LANDING_EASE,
      },
    );
    // The drop plays once, when the toast appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hovered || closing) {
      return undefined;
    }
    const timeout = setTimeout(close, TOAST_TIME_MS);
    return () => {
      clearTimeout(timeout);
    };
  }, [hovered, closing, close]);

  useEffect(() => {
    if (!closing) {
      return;
    }
    function remove() {
      store.dispatch(achievementToastClosed(toast.key));
    }
    const animation =
      reducedMotion || element.current === null
        ? undefined
        : element.current.animate(
            [
              {
                opacity: 1,
                transform: "translateY(0)",
              },
              {
                opacity: 0,
                transform: "translateY(-0.5em)",
              },
            ],
            {
              duration: CLOSE_TIME_MS,
              easing: "ease-in",
              fill: "forwards",
            },
          );
    if (animation === undefined) {
      remove();
    } else {
      animation.onfinish = remove;
    }
  }, [closing, reducedMotion, toast.key]);

  return (
    <button
      className="tw:pointer-events-auto tw:flex tw:w-full tw:cursor-pointer tw:[font:inherit] tw:[letter-spacing:inherit] tw:items-center tw:gap-3 tw:rounded-lg tw:border-2 tw:border-[var(--button-primary-bg)] tw:bg-surface-panel tw:p-2.5 tw:text-left tw:text-text tw:shadow-[0_6px_18px_rgb(0_0_0/0.35)]"
      onClick={close}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
      ref={element}
      type="button"
    >
      <AchievementArt id={achievement.id} unlocked />
      <span className="tw:min-w-0 tw:flex-1 tw:leading-snug">
        <span className="tw:block tw:text-[0.8em] tw:text-text-label">
          Achievement unlocked
        </span>
        <span className="tw:block tw:font-semibold">{achievement.name}</span>
        <span className="tw:block tw:text-[0.85em] tw:leading-snug tw:text-text-label">
          {achievement.description}
        </span>
      </span>
    </button>
  );
}
