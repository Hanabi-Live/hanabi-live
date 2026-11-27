// The banner at the top of the window while the connection to the server is down, outside of the
// New UI, which shows its own panel over the hands (see "game/newUi/ReconnectingPanel.tsx").

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { OPEN_DURATION_IN_MILLISECONDS } from "./Tooltip.ts";
import { useReducedMotion } from "./fade.ts";
import {
  SHOW_DELAY_MILLISECONDS,
  useOnline,
} from "./game/newUi/ReconnectingPanel.tsx";
import { useAppSelector } from "./store.ts";

export function ReconnectingBanner(): React.JSX.Element | undefined {
  const reconnecting = useAppSelector((state) => state.session.reconnecting);
  const newUiShown = useAppSelector((state) => state.newUi.shown);
  const signedIn = useAppSelector((state) => state.login.page !== "login");
  return reconnecting && signedIn && !newUiShown ? <Banner /> : undefined;
}

function Banner(): React.JSX.Element | undefined {
  const [shown, setShown] = useState(false);
  const online = useOnline();
  const reducedMotion = useReducedMotion();
  const bannerRef = useRef<HTMLDivElement>(null);

  // Most drops recover at once, and a banner that flashes for a moment would only distract.
  useEffect(() => {
    const timer = setTimeout(() => {
      setShown(true);
    }, SHOW_DELAY_MILLISECONDS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!shown || banner === null || reducedMotion) {
      return undefined;
    }
    const appear = banner.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: OPEN_DURATION_IN_MILLISECONDS,
      easing: "ease-out",
    });
    return () => {
      appear.cancel();
    };
  }, [shown, reducedMotion]);

  if (!shown) {
    return undefined;
  }

  return (
    <div
      className="tw:fixed tw:top-3 tw:left-1/2 tw:z-[calc(var(--z-header)+1)] tw:flex tw:w-max tw:max-w-[calc(100vw-2em)] tw:-translate-x-1/2 tw:items-center tw:gap-3 tw:rounded-lg tw:border tw:border-border tw:bg-surface tw:px-4 tw:py-2 tw:text-text tw:shadow-[0_8px_24px_rgb(0_0_0/45%)]"
      data-reconnecting-banner
      ref={bannerRef}
      role="status"
    >
      <i aria-hidden="true" className="fas fa-plug tw:text-xl tw:text-error" />
      <div>
        <div className="tw:font-bold">Reconnecting...</div>
        <div className="tw:text-[0.9em] tw:leading-snug tw:text-text-label">
          {online
            ? "What you send does not reach the server until the connection is back."
            : "Your device is offline. The page reconnects when the network is back."}
        </div>
      </div>
    </div>
  );
}
