// A dropdown that is as wide as its widest option. The page draws the list of a dropdown
// ("appearance: base-select" in "defaults.css"), and Chrome then makes the dropdown only as wide as
// its selected option, so it would change width when we pick another option.

import type { ComponentProps } from "react";
import { Children, isValidElement } from "react";

/** The classes of a small dropdown in a row of filters, which is as tall as the filters. */
export const SMALL_SELECT_CLASS =
  "tw:h-8 tw:py-0 tw:pr-10 tw:pl-3 tw:text-[1em] tw:leading-8";

/** Use this instead of `<select>`, with the same props. */
export function Select({
  className = "",
  children,
  ...props
}: ComponentProps<"select">): React.JSX.Element {
  // Each option has an invisible copy of the dropdown in the same cell of the grid, which shows
  // only that option. The cell is as wide as the widest copy, and the dropdown fills the cell.
  const labels = Children.toArray(children).map((child): React.ReactNode =>
    isValidElement<ComponentProps<"option">>(child) ? child.props.children : "",
  );
  const cell = "tw:col-start-1 tw:row-start-1";

  return (
    <span className="tw:inline-grid tw:shrink-0">
      <select className={`${cell} ${className}`} {...props}>
        {children}
      </select>
      {labels.map((label, index) => (
        <select
          aria-hidden
          className={`${cell} tw:invisible ${className}`}
          key={index}
          tabIndex={-1}
        >
          <option>{label}</option>
        </select>
      ))}
    </span>
  );
}
