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
  element.after(copy);

  // A copy does not keep how far its lists were scrolled.
  const parts = element.querySelectorAll("*");
  const copiedParts = copy.querySelectorAll("*");
  for (const [i, part] of parts.entries()) {
    const copiedPart = copiedParts[i];
    if (copiedPart !== undefined && part.scrollTop !== 0) {
      copiedPart.scrollTop = part.scrollTop;
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
