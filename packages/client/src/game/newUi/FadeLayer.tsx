import { useState } from "react";
import {
  CLOSE_DURATION_IN_MILLISECONDS,
  OPEN_DURATION_IN_MILLISECONDS,
} from "../../Tooltip.ts";
import { getOpacityTransition } from "./motion.ts";
import { KEY_PRESS_MILLISECONDS } from "./surfaces.ts";

/**
 * Lets a button or a box take a color that fades in and out, such as the light color of a pressed
 * button. Give the element this class, and give the layer the color. A hover color on the layer
 * uses the group: `tw:group-hover/layer:`.
 */
export const FADE_LAYER_PARENT_CLASS = "tw:group/layer tw:relative tw:isolate";

/**
 * A color over the background of its parent and under its content (see `FADE_LAYER_PARENT_CLASS`),
 * which fades in and out, as fast as a tooltip opens and closes. Only its opacity animates, never a
 * background color (see `useModeFade` in "StatusStrip.tsx").
 */
export function FadeLayer({
  shown,
  className,
  reducedMotion,
}: {
  readonly shown: boolean;

  /** The color of the layer, such as `tw:bg-game-text`. */
  readonly className: string;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`tw:pointer-events-none tw:absolute tw:inset-0 tw:-z-10 tw:rounded-[inherit] ${className}`}
      style={{
        opacity: shown ? 1 : 0,
        transition: reducedMotion ? undefined : getOpacityTransition(shown),
      }}
    />
  );
}

/**
 * A label that fades in when it changes, such as that of a button whose color fades with a
 * `FadeLayer`. The old label goes at once, so that the button takes the new label's width at once.
 * The first label shows at once.
 */
export function FadeInLabel({
  label,
  reducedMotion,
}: {
  readonly label: string;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const [first] = useState(label);
  const [changed, setChanged] = useState(false);
  if (!changed && label !== first) {
    setChanged(true);
  }
  const fades = changed && !reducedMotion;
  return (
    <span
      className={fades ? "tw:starting:opacity-0" : undefined}
      // A new label is a new element, so that it fades in.
      key={label}
      style={{
        transition: fades ? getOpacityTransition(true) : undefined,
      }}
    >
      {label}
    </span>
  );
}

/**
 * The transition of a button that has `KEY_CLASS` and a `FadeLayer`: its press, and the color of
 * its text, which changes with the layer, as fast. A text color is not a background color, so it
 * may animate. The "Reduced motion" setting leaves out the change of color.
 */
export function getKeyTextColorStyle(
  shown: boolean,
  reducedMotion: boolean,
): React.CSSProperties | undefined {
  if (reducedMotion) {
    return undefined;
  }
  const press = `${KEY_PRESS_MILLISECONDS}ms`;
  return {
    transitionProperty: "translate, box-shadow, color",
    transitionDuration: `${press}, ${press}, ${shown ? OPEN_DURATION_IN_MILLISECONDS : CLOSE_DURATION_IN_MILLISECONDS}ms`,
    transitionTimingFunction: `ease-out, ease-out, ${shown ? "ease-out" : "ease-in"}`,
  };
}
