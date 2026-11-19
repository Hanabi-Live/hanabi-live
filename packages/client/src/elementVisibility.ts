// Shows, hides, and fades the parts of the page that are not React components, such as the game
// screens and the classic screen's chat window.

import { FADE_TIME_MS } from "./constants.ts";
import { store } from "./store.ts";

const FADE_ANIMATION_ID = "fade";

/**
 * Shows an element. An element that the "hidden" class hides shows as a block, as jQuery's `show`
 * did.
 */
export function showElement(element: HTMLElement): void {
  stopFade(element);
  element.style.display = "";
  if (getComputedStyle(element).display === "none") {
    element.style.display = "block";
  }
}

export function hideElement(element: HTMLElement): void {
  stopFade(element);
  element.style.display = "none";
}

/** Whether an element takes up space on the page, as jQuery's ":visible" selector. */
export function isElementShown(element: HTMLElement): boolean {
  return (
    element.offsetWidth > 0
    || element.offsetHeight > 0
    || element.getClientRects().length > 0
  );
}

/**
 * How long a part of the page takes to fade in or out, in milliseconds. With the "Reduced motion"
 * setting, it shows and goes at once.
 */
export function getFadeTimeMs(): number {
  return store.getState().session.settings.reducedMotion ? 0 : FADE_TIME_MS;
}

export function fadeIn(element: HTMLElement): void {
  if (isElementShown(element) && !isFading(element)) {
    return;
  }

  showElement(element);
  if (getFadeTimeMs() === 0) {
    return;
  }
  const animation = element.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: FADE_TIME_MS,
    easing: "ease-in-out",
  });
  animation.id = FADE_ANIMATION_ID;
}

export function fadeOut(element: HTMLElement): void {
  if (!isElementShown(element)) {
    return;
  }

  if (getFadeTimeMs() === 0) {
    hideElement(element);
    return;
  }
  stopFade(element);
  const animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: FADE_TIME_MS,
    easing: "ease-in-out",
  });
  animation.id = FADE_ANIMATION_ID;
  animation.addEventListener("finish", () => {
    element.style.display = "none";
  });
}

function fadeAnimations(element: HTMLElement): readonly Animation[] {
  return element
    .getAnimations()
    .filter((animation) => animation.id === FADE_ANIMATION_ID);
}

function isFading(element: HTMLElement): boolean {
  return fadeAnimations(element).length > 0;
}

/** Stops a fade, so that a fade out that is still running cannot hide the element later. */
function stopFade(element: HTMLElement) {
  for (const animation of fadeAnimations(element)) {
    animation.cancel();
  }
}
