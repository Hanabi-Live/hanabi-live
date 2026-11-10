// An icon that summarizes a table's option, with a tooltip that explains it.

import { useEffect, useRef } from "react";
import * as tooltips from "../tooltips";
import type { OptionDescription } from "./optionDescriptions";

export function OptionIcon({
  description: { icon, label, tooltip },
  tooltipClassName,
}: {
  readonly description: Pick<OptionDescription, "label" | "tooltip"> & {
    readonly icon: string;
  };
  readonly tooltipClassName: string;
}): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  useEffect(
    () =>
      tooltips.attach(
        ref.current!,
        `<div class="${tooltipClassName}">${tooltip}</div>`,
      ),
    [tooltip, tooltipClassName],
  );

  return (
    <li>
      <i
        className={label === undefined ? icon : `${icon} icon-label`}
        ref={ref}
      />
      {label}
    </li>
  );
}
