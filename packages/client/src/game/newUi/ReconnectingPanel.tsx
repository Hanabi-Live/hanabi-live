import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CLOSE_DURATION_IN_MILLISECONDS,
  OPEN_DURATION_IN_MILLISECONDS,
} from "../../Tooltip.ts";
import { fadeOutCopy } from "./motion.ts";

/**
 * How long the connection must stay down before the panel shows, in milliseconds. Most drops
 * recover sooner than this, and a panel that flashes for a moment would only distract.
 */
export const SHOW_DELAY_MILLISECONDS = 1000;

/** How long one breath of the icon takes, in milliseconds. */
export const BREATHE_MILLISECONDS = 1600;

function subscribeToOnline(onChange: () => void): () => void {
  globalThis.addEventListener("online", onChange);
  globalThis.addEventListener("offline", onChange);
  return () => {
    globalThis.removeEventListener("online", onChange);
    globalThis.removeEventListener("offline", onChange);
  };
}

function isOnline(): boolean {
  return navigator.onLine;
}

/** Whether the device has a network. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeToOnline, isOnline);
}

/**
 * The panel over the hands while the connection to the server is down. Until the game reloads, the
 * server receives no move, so the panel also stops clicks on the cards. The cards show through it,
 * so that the player can keep thinking about the game.
 */
export function ReconnectingPanel({
  reducedMotion,
}: {
  readonly reducedMotion: boolean;
}): React.JSX.Element | undefined {
  const [shown, setShown] = useState(false);
  const online = useOnline();
  const panelRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(true);
    }, SHOW_DELAY_MILLISECONDS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  // The panel fades in, and the icon breathes while the client tries again. When the connection
  // comes back, a copy of the panel fades out (see `fadeOutCopy`). All of it only decorates.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const icon = iconRef.current;
    if (!shown || panel === null || icon === null || reducedMotion) {
      return undefined;
    }

    const appear = panel.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: OPEN_DURATION_IN_MILLISECONDS,
      easing: "ease-out",
    });
    const breathe = icon.animate(
      [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }],
      {
        duration: BREATHE_MILLISECONDS,
        easing: "ease-in-out",
        iterations: Infinity,
      },
    );
    return () => {
      const opacity = Number(getComputedStyle(panel).opacity);
      appear.cancel();
      breathe.cancel();
      fadeOutCopy(panel, [{ opacity }, { opacity: 0 }], {
        duration: CLOSE_DURATION_IN_MILLISECONDS,
        easing: "ease-in",
      });
    };
  }, [shown, reducedMotion]);

  return (
    // The cards show through the panel, and the text sits on a card of its own. Before it shows, it
    // is still there and empty, so that no click reaches the cards.
    <div
      className={`tw:absolute tw:inset-0 tw:z-30 tw:flex tw:items-center tw:justify-center tw:phone:items-start tw:rounded-game-panel ${
        shown ? "tw:bg-game-panel/60" : ""
      }`}
      data-reconnecting-panel
      ref={panelRef}
      role="status"
    >
      {shown && (
        <div className="tw:flex tw:flex-col tw:items-center tw:gap-1 tw:rounded-game-panel tw:bg-game-panel tw:px-8 tw:py-6 tw:text-center tw:shadow-[0_12px_32px_rgb(0_0_0/55%)] tw:ring-1 tw:ring-game-line tw:phone:sticky tw:phone:top-12">
          <i
            aria-hidden="true"
            className="fas fa-plug tw:mb-2 tw:text-4xl tw:text-game-turn"
            ref={iconRef}
          />
          <div className="tw:text-2xl tw:font-bold tw:text-game-text">
            Reconnecting...
          </div>
          <p className="tw:m-0 tw:max-w-80 tw:text-sm tw:text-game-muted">
            {online
              ? "The connection to the server dropped. You can move again when the game reloads."
              : "Your device is offline. The game reconnects when the network is back."}
          </p>
        </div>
      )}
    </div>
  );
}
