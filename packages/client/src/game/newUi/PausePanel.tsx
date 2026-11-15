import { useLayoutEffect, useRef } from "react";
import { KEY_CLASS } from "./surfaces.ts";

/** How long the panel takes to appear, in milliseconds. */
const APPEAR_MILLISECONDS = 160;

/**
 * The panel over the hands while the game is paused. It says who paused the game, and a player can
 * unpause it from here. The chat and the way back to the lobby stay in their usual places.
 */
export function PausePanel({
  pausedBy,
  onUnpause,
  reducedMotion,
}: {
  readonly pausedBy: string;

  /** Unpauses the game. It is `undefined` for a spectator, who cannot unpause it. */
  readonly onUnpause: (() => void) | undefined;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);

  // The panel settles into place, so that the pause reads as something that just happened.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (panel === null || reducedMotion) {
      return undefined;
    }

    const animation = panel.animate(
      [
        {
          opacity: 0,
          scale: "0.94",
        },
        {
          opacity: 1,
          scale: "1",
        },
      ],
      {
        duration: APPEAR_MILLISECONDS,
        easing: "cubic-bezier(0.2, 0.9, 0.3, 1.2)",
      },
    );
    return () => {
      animation.cancel();
    };
  }, [reducedMotion]);

  return (
    // Over the middle of the hands, so that the hands keep their size.
    <div
      className="tw:absolute tw:top-1/2 tw:left-1/2 tw:z-20 tw:-translate-1/2"
      data-pause-panel
    >
      <div
        className="tw:flex tw:min-w-64 tw:flex-col tw:items-center tw:gap-1 tw:rounded-game-panel tw:bg-game-panel tw:px-8 tw:pt-5 tw:pb-6 tw:text-center tw:shadow-[0_12px_32px_rgb(0_0_0/55%)] tw:ring-1 tw:ring-game-line"
        ref={panelRef}
        role="status"
      >
        <i
          aria-hidden="true"
          className="fas fa-pause tw:mb-2 tw:text-2xl tw:text-game-turn"
        />
        <div className="tw:text-xl tw:font-bold tw:text-game-text">
          Game paused
        </div>
        <p className="tw:m-0 tw:max-w-72 tw:truncate tw:text-sm tw:text-game-muted">
          {pausedBy} paused the game.
        </p>
        {onUnpause !== undefined && (
          <button
            className={`tw:mt-4 tw:flex tw:h-11 tw:cursor-pointer tw:items-center tw:gap-2 tw:rounded-game-control tw:border-0 tw:bg-game-text tw:px-5 tw:text-[15px] tw:font-bold tw:text-card-ink tw:hover:brightness-110 ${KEY_CLASS}`}
            onClick={onUnpause}
            type="button"
          >
            <i aria-hidden="true" className="fas fa-play" />
            Unpause
          </button>
        )}
      </div>
    </div>
  );
}
