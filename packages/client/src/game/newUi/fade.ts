import {
  CLOSE_DURATION_IN_MILLISECONDS,
  OPEN_DURATION_IN_MILLISECONDS,
} from "../../Tooltip.ts";

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
 * Leaves a copy of an element that React is about to remove, and plays an animation on the copy,
 * such as a fade-out. The copy goes when the animation finishes or is canceled. Then the element
 * itself can go at once, and the copy shows what it showed last. The copy cannot be clicked or
 * focused, and screen readers skip it. Call it while the element is still on the page, such as in
 * the cleanup of a layout effect.
 */
export function fadeOutCopy(
  element: HTMLElement,
  keyframes: readonly Keyframe[],
  options: KeyframeAnimationOptions,
): void {
  if (!element.isConnected) {
    return;
  }

  const copy = element.cloneNode(true) as HTMLElement;
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.style.pointerEvents = "none";
  for (const part of copy.querySelectorAll("[role]")) {
    part.removeAttribute("role");
  }
  // The page finds some elements by their IDs, such as the chat's messages. It must not find the
  // copy.
  copy.removeAttribute("id");
  for (const part of copy.querySelectorAll("[id]")) {
    part.removeAttribute("id");
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
}
