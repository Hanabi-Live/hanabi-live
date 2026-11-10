// An icon that summarizes a table's option, with a tooltip that explains it.

import { useEffect, useRef } from "react";
import * as tooltips from "../tooltips";
import type { OptionDescription } from "./optionDescriptions";

export function OptionIcon({
  description: { icon, label, tooltip },
}: {
  readonly description: Pick<OptionDescription, "label" | "tooltip"> & {
    readonly icon: string;
  };
}): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  useEffect(
    () =>
      tooltips.attach(
        ref.current!,
        `<div class="tw:text-[0.75em]">${tooltip}</div>`,
      ),
    [tooltip],
  );

  return (
    <li className="tw:mr-[0.5em] tw:inline-block tw:pl-0">
      <i
        className={label === undefined ? icon : `${icon} icon-label`}
        ref={ref}
      />
      {label}
    </li>
  );
}
