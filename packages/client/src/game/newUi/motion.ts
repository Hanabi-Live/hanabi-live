import { useLayoutEffect } from "react";
import {
  CLOSE_DURATION_IN_MILLISECONDS,
  OPEN_DURATION_IN_MILLISECONDS,
} from "../../Tooltip.ts";

/** The control points of the cubic Bezier curve of `SLIDE`. */
const SLIDE_CURVE = [0.33, 1, 0.68, 1] as const;

/**
 * Returns the CSS easing of a cubic Bezier curve from its control points. It rounds them, so that a
 * curve that is computed from another one does not get floating-point noise, such as
 * 0.31999999999999995.
 */
function getCubicBezier(
  points: readonly [number, number, number, number],
): string {
  const rounded = points.map((point) => Math.round(point * 1000) / 1000);
  return `cubic-bezier(${rounded.join(", ")})`;
}

/**
 * How a part of the screen slides to its place: a drawer out of its box, such as the clue menu, the
 * chat that covers the table, or the replay controls in the status panel, the timeline's knob to
 * the leader's turn, or an arrow as it drops in.
 */
export const SLIDE = {
  duration: 200,
  easing: getCubicBezier(SLIDE_CURVE),
} as const;

/**
 * How a part of the screen slides back out of view, such as a drawer that closes. It is `SLIDE`
 * played backward: its curve is the mirror of `SLIDE`'s, so that a drawer closes as slowly as it
 * opens. It starts slowly and speeds up as it goes. Do not give it another curve. With `SLIDE`'s
 * own curve, or with a curve that moves evenly, the close looks about twice as fast as the open
 * (this regressed twice). An element that also fades as it closes should fade on its own, faster
 * curve, so that it starts to change at once (see `ClueHandLayer` in "ClueMenu.tsx").
 */
export const SLIDE_BACK = {
  duration: SLIDE.duration,
  easing: getCubicBezier([
    1 - SLIDE_CURVE[2],
    1 - SLIDE_CURVE[3],
    1 - SLIDE_CURVE[0],
    1 - SLIDE_CURVE[1],
  ]),
} as const;

/**
 * The CSS transition of the opacity of an element that shows or hides, as fast as a tooltip opens
 * or closes. Only the opacity changes, never a color (see `useModeFade` in "StatusStrip.tsx").
 */
export function getOpacityTransition(shown: boolean): string {
  return shown
    ? `opacity ${OPEN_DURATION_IN_MILLISECONDS}ms ease-out`
    : `opacity ${CLOSE_DURATION_IN_MILLISECONDS}ms ease-in`;
}

/**
 * The CSS transition of the color of a text that changes with a color behind it that fades in or
 * out (see `FadeLayer`), as fast. A text color is not a background color, so it may animate.
 */
export function getColorTransition(shown: boolean): string {
  return shown
    ? `color ${OPEN_DURATION_IN_MILLISECONDS}ms ease-out`
    : `color ${CLOSE_DURATION_IN_MILLISECONDS}ms ease-in`;
}

/**
 * The CSS transition of an element that shows or hides with the class `tw:invisible`: its opacity
 * fades as in `getOpacityTransition`, and it becomes invisible only when it has faded out. Give it
 * an opacity of 0 while it is hidden.
 */
export function getVisibilityTransition(shown: boolean): string {
  return shown
    ? getOpacityTransition(true)
    : `${getOpacityTransition(false)}, visibility 0s linear ${CLOSE_DURATION_IN_MILLISECONDS}ms`;
}

/** The attributes by which the page finds elements, which a copy from `fadeOutCopy` leaves out. */
const COPY_HIDDEN_ATTRIBUTES = [
  "id",
  "data-card-order",
  "data-card-place",
  "data-clue-button",
  "data-out-of-max",
] as const;

/**
 * Leaves a copy of an element that React is about to remove, and plays an animation on the copy,
 * such as a fade-out. The copy goes when the animation finishes or is canceled. Then the element
 * itself can go at once, and the copy shows what it showed last. The copy cannot be clicked or
 * focused, and screen readers skip it. Call it while the element is still on the page, such as in
 * the cleanup of a layout effect. If the element stays on the page, the copy goes at once. It
 * returns the copy, so that its parts can play their own animations.
 */
export function fadeOutCopy<Copied extends HTMLElement | SVGElement>(
  element: Copied,
  keyframes: readonly Keyframe[],
  options: KeyframeAnimationOptions,
): Copied | undefined {
  if (!element.isConnected) {
    return undefined;
  }

  const copy = element.cloneNode(true) as Copied;
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.style.pointerEvents = "none";
  for (const part of copy.querySelectorAll("[role]")) {
    part.removeAttribute("role");
  }
  // The page finds some elements by these attributes, such as the chat's messages by their IDs, the
  // cards that move by their order (see "cardMotion.ts"), and the maximum score that pops (see
  // "scoreMotion.ts"). It must not find the copy.
  for (const attribute of COPY_HIDDEN_ATTRIBUTES) {
    copy.removeAttribute(attribute);
    for (const part of copy.querySelectorAll(`[${CSS.escape(attribute)}]`)) {
      part.removeAttribute(attribute);
    }
  }
  element.after(copy);

  // A copy does not keep how far its lists were scrolled, or the text in its boxes.
  const parts = element.querySelectorAll("*");
  const copiedParts = copy.querySelectorAll("*");
  for (const [i, part] of parts.entries()) {
    const copiedPart = copiedParts[i];
    if (copiedPart === undefined) {
      continue;
    }
    if (part.scrollTop !== 0) {
      copiedPart.scrollTop = part.scrollTop;
    }
    if (
      part instanceof HTMLInputElement
      && copiedPart instanceof HTMLInputElement
    ) {
      copiedPart.value = part.value;
    }
  }

  const animation = copy.animate([...keyframes], {
    ...options,
    fill: "forwards",
  });
  function remove() {
    copy.remove();
  }
  animation.addEventListener("finish", remove);
  animation.addEventListener("cancel", remove);

  // In development, React's strict mode runs the cleanup of a new element's effects once more,
  // without removing the element. React removes an element in the same task as the cleanup, so an
  // element that is still on the page after it stays, and needs no copy.
  queueMicrotask(() => {
    if (element.isConnected) {
      animation.cancel();
    }
  });

  return copy;
}

/**
 * An element fades in when it appears, and a copy of it fades out when it goes (see `fadeOutCopy`).
 * By default, it fades as fast as a tooltip opens and closes. Give `milliseconds` to fade with
 * something that takes that long both ways. The "Reduced motion" setting leaves out both fades.
 */
export function useFade(
  ref: React.RefObject<HTMLElement | null>,
  reducedMotion: boolean,
  milliseconds?: number,
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || reducedMotion) {
      return undefined;
    }
    const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: milliseconds ?? OPEN_DURATION_IN_MILLISECONDS,
      easing: "ease-out",
    });

    // The element is still on the page when the cleanup runs: React removes it after that.
    return () => {
      const shown = Number(getComputedStyle(element).opacity);
      animation.cancel();
      fadeOutCopy(element, [{ opacity: shown }, { opacity: 0 }], {
        duration: milliseconds ?? CLOSE_DURATION_IN_MILLISECONDS,
        easing: "ease-in",
      });
    };
  }, [ref, reducedMotion, milliseconds]);
}
