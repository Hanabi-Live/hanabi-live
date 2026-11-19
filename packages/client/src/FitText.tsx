import { clamp } from "complete-common";
import { useLayoutEffect, useRef } from "react";

/** The smallest size that the text is drawn at, as a fraction of its full size, by default. */
const MIN_SCALE = 0.5;

/** How much smaller the text gets at each step, until it fits. */
const SCALE_STEP = 0.01;

/**
 * Text on one line that takes the width it needs, up to the space that it has. If it is too long
 * for that space, it is drawn smaller until it fits. Text that does not fit even at `minScale` is
 * cut off with an ellipsis.
 *
 * A hidden copy at the full size sets the width and the height, so that a new size for the text
 * that shows does not change the space that it has.
 */
export function FitText({
  text,
  minScale = MIN_SCALE,
}: {
  readonly text: React.ReactNode;
  /** The smallest size of the text, as a fraction of its full size. */
  readonly minScale?: number;
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
          ? clamp(
              Math.floor((100 * room) / full.offsetWidth) / 100,
              minScale,
              1,
            )
          : 1;
      shown.style.fontSize = `${scale}em`;

      // Text does not always shrink in proportion to its size: letters can snap to whole pixels,
      // and letter spacing in pixels does not shrink. So it gets smaller until it really fits.
      while (shown.scrollWidth > room && scale > minScale) {
        scale -= SCALE_STEP;
        shown.style.fontSize = `${scale}em`;
      }
    }

    fit();
    const observer = new ResizeObserver(fit);
    // The space can stay the same while the text gets wider, such as when it turns bold or changes.
    // The hidden copy then changes its size.
    observer.observe(outer);
    observer.observe(full);
    return () => {
      observer.disconnect();
    };
  }, [minScale]);

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
      <span className="tw:absolute tw:inset-0 tw:flex tw:items-center">
        <span className="tw:min-w-0 tw:truncate" ref={shownRef}>
          {text}
        </span>
      </span>
    </span>
  );
}
