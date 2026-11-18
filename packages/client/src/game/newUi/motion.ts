import { useLayoutEffect } from "react";
import {
  CLOSE_DURATION_IN_MILLISECONDS,
  OPEN_DURATION_IN_MILLISECONDS,
} from "../../Tooltip.ts";

/**
 * How a part of the screen slides to its place: a drawer out of its box, such as the clue menu, the
 * chat that covers the table, or the replay controls in the status panel, the timeline's knob to
 * the leader's turn, or an arrow as it drops in.
 */
export const SLIDE = {
  duration: 200,
  easing: "cubic-bezier(0.33, 1, 0.68, 1)",
} as const;

/**
 * How a part of the screen slides back out of view, such as a drawer that closes. It is `SLIDE`
 * played backward: its curve is the mirror of `SLIDE`'s, so that it starts slowly and speeds up as
 * it goes. With `SLIDE`'s own curve, most of the slide would happen at the start, and the close
 * would look twice as fast as the open.
 */
export const SLIDE_BACK = {
  duration: SLIDE.duration,
  easing: "cubic-bezier(0.32, 0, 0.67, 0)",
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
export function fadeOutCopy(
  element: HTMLElement,
  keyframes: readonly Keyframe[],
  options: KeyframeAnimationOptions,
): HTMLElement | undefined {
  if (!element.isConnected) {
    return undefined;
  }

  const copy = element.cloneNode(true) as HTMLElement;
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
