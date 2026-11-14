import { useLayoutEffect, useRef } from "react";

/** The smallest size that the text is drawn at, as a fraction of its full size. */
const MIN_SCALE = 0.5;

/** How much smaller the text gets at each step, until it fits. */
const SCALE_STEP = 0.01;

/**
 * Text on one line that takes the width it needs, up to the space that it has. If it is too long
 * for that space, it is drawn smaller until it fits, instead of being cut off.
 *
 * A hidden copy at the full size sets the width and the height, so that a new size for the text
 * that shows does not change the space that it has.
 */
export function FitText({
  text,
}: {
  readonly text: string;
}): React.JSX.Element {
  const outerRef = useRef<HTMLSpanElement>(null);
  const fullRef = useRef<HTMLSpanElement>(null);
  const shownRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current!;
    const full = fullRef.current!;
    const shown = shownRef.current!;
    function fit() {
      const room = outer.clientWidth;
      let scale =
        full.offsetWidth > room
          ? Math.floor((100 * room) / full.offsetWidth) / 100
          : 1;
      shown.style.fontSize = `${scale}em`;

      // Text does not always shrink in proportion to its size: letters can snap to whole pixels,
      // and letter spacing in pixels does not shrink. So it gets smaller until it really fits.
      while (shown.scrollWidth > room && scale > MIN_SCALE) {
        scale -= SCALE_STEP;
        shown.style.fontSize = `${scale}em`;
      }
    }

    fit();
    const observer = new ResizeObserver(fit);
    // The space can stay the same while the text gets wider, such as when it turns bold.
    observer.observe(outer);
    observer.observe(full);
    return () => {
      observer.disconnect();
    };
  }, [text]);

  return (
    <span
      className="tw:relative tw:min-w-0 tw:overflow-x-clip tw:whitespace-nowrap"
      ref={outerRef}
    >
      <span
        aria-hidden="true"
        className="tw:invisible tw:block tw:w-max"
        ref={fullRef}
      >
        {text}
      </span>
      <span
        className="tw:absolute tw:inset-0 tw:flex tw:items-center"
        ref={shownRef}
      >
        {text}
      </span>
    </span>
  );
}
