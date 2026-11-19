// Fades and reveals of the parts of the page outside the game screen, such as the lobby. Each one
// takes `FADE_TIME_MS`, as `fadeIn` and `fadeOut` do. The "Reduced motion" setting leaves them out.

import { useState } from "react";
import { FADE_TIME_MS } from "./constants.ts";
import { useAppSelector } from "./store.ts";

/**
 * The classes of an element that fades in when it appears, either when React adds it or when it
 * stops being hidden. Give it the style from `getFadeStyle` too. Only its opacity animates.
 */
export const FADE_IN_CLASS = "tw:transition-opacity tw:starting:opacity-0";

/**
 * The style of an element that fades with `FADE_IN_CLASS` or an opacity that changes, as fast as
 * `fadeIn`. The "Reduced motion" setting leaves out the fade.
 */
export function getFadeStyle(
  reducedMotion: boolean,
  milliseconds = FADE_TIME_MS,
): React.CSSProperties {
  return { transitionDuration: reducedMotion ? "0s" : `${milliseconds}ms` };
}

/** Whether the player turned on the "Reduced motion" setting. */
export function useReducedMotion(): boolean {
  return useAppSelector((state) => state.session.settings.reducedMotion);
}

/** The parts of a reveal that every state has. */
const REVEAL_CLASS =
  "tw:overflow-clip tw:transition-[height,min-height,padding,margin,border-width,opacity,display] tw:transition-discrete tw:[interpolate-size:allow-keywords] tw:[overflow-clip-margin:0.25em]";

/**
 * The classes of an element that grows out of nothing and fades in when it shows, and shrinks and
 * fades out when it hides, such as rows that a checkbox shows. It shows or hides at once when it
 * first renders, such as when its page opens. Its content stays on the page while it is hidden.
 * Give it the style from `getFadeStyle` too. This changes the padding, margin, and border above and
 * below the element, so its own Tailwind classes must not set them. Wrap the element to keep them.
 */
export function useRevealClassName(shown: boolean): string {
  const [first] = useState(shown);
  const [changed, setChanged] = useState(false);
  if (!changed && shown !== first) {
    setChanged(true);
  }
  if (!shown) {
    return `${REVEAL_CLASS} tw:hidden tw:h-0 tw:min-h-0 tw:py-0 tw:my-0 tw:border-y-0 tw:opacity-0`;
  }
  return changed
    ? `${REVEAL_CLASS} tw:h-auto tw:starting:h-0 tw:starting:min-h-0 tw:starting:py-0 tw:starting:my-0 tw:starting:border-y-0 tw:starting:opacity-0`
    : `${REVEAL_CLASS} tw:h-auto`;
}
