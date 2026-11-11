/** The class name of a text tab, which a green line underlines while it is selected. */
export const TAB_CLASS_NAME = [
  "tw:cursor-pointer tw:appearance-none tw:border-0 tw:border-b-2 tw:border-solid tw:border-transparent tw:bg-transparent tw:p-0",
  "tw:[font-family:inherit] tw:[font-size:inherit] tw:[font-weight:inherit] tw:leading-[1.3] tw:tracking-[inherit] tw:text-text-label",
  "tw:transition-[color,border-color] tw:duration-200 tw:ease-in-out tw:hover:text-text-strong",
  "tw:aria-selected:cursor-default tw:aria-selected:border-b-(--button-green) tw:aria-selected:text-text-strong",
].join(" ");
