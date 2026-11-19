/**
 * The class name of a text tab. A brass line underlines it while it is selected. While the mouse is
 * over a tab that is not selected, a line of half that height underlines it. The line grows from
 * its center, unless the player turned on the "Reduced motion" setting.
 */
export function getTabClassName(reducedMotion: boolean): string {
  return [
    "tw:relative tw:cursor-pointer tw:select-none tw:appearance-none tw:border-0 tw:bg-transparent tw:p-0 tw:pb-0.5",
    "tw:[font-family:inherit] tw:[font-size:inherit] tw:[font-weight:inherit] tw:leading-[1.3] tw:tracking-[inherit] tw:text-text-label",
    "tw:hover:text-text",
    "tw:after:absolute tw:after:inset-x-0 tw:after:bottom-0 tw:after:h-0.5 tw:after:origin-bottom tw:after:scale-x-0 tw:after:bg-(--button-primary-bg) tw:after:content-['']",
    "tw:not-aria-selected:hover:after:scale-x-100 tw:not-aria-selected:hover:after:scale-y-50",
    "tw:aria-selected:cursor-default tw:aria-selected:text-text tw:aria-selected:after:scale-x-100",
    reducedMotion ? "" : TAB_TRANSITION_CLASS_NAME,
  ].join(" ");
}

/** The classes that animate a tab's text color and its line. */
export const TAB_TRANSITION_CLASS_NAME =
  "tw:transition-[color] tw:duration-200 tw:ease-in-out tw:after:transition-transform tw:after:duration-200 tw:after:ease-out";
