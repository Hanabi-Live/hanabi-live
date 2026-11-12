// An icon that summarizes a table's option, with a tooltip that explains it.

import { tooltipRefHtml } from "../tooltipRef.ts";
import type { OptionDescription } from "./optionDescriptions.ts";

export function OptionIcon({
  description: { icon, label, tooltip },
}: {
  readonly description: Pick<OptionDescription, "label" | "tooltip"> & {
    readonly icon: string;
  };
}): React.JSX.Element {
  const ref = tooltipRefHtml(`<div class="tw:text-[0.75em]">${tooltip}</div>`, {
    instant: true,
  });

  return (
    <li className="tw:mr-2 tw:inline-block tw:pl-0">
      <i
        className={label === undefined ? icon : `${icon} tw:mr-[0.4em]`}
        ref={ref}
      />
      {label}
    </li>
  );
}
