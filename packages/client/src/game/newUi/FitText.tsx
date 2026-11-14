import { useLayoutEffect, useRef } from "react";

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
  const shownRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current!;
    const shown = shownRef.current!;
    function fit() {
      const scale =
        outer.scrollWidth > outer.clientWidth
          ? Math.floor((100 * outer.clientWidth) / outer.scrollWidth) / 100
          : 1;
      shown.style.fontSize = `${scale}em`;
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(outer);
    return () => {
      observer.disconnect();
    };
  }, [text]);

  return (
    <span
      className="tw:relative tw:min-w-0 tw:overflow-x-clip tw:whitespace-nowrap"
      ref={outerRef}
    >
      <span aria-hidden="true" className="tw:invisible">
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
