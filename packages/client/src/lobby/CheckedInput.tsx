import { useEffect, useRef } from "react";
import { Tooltip } from "../Tooltip.ts";
import { escapeHtml } from "../utils.ts";

/** A text box that turns red and explains why in a tooltip while its value is invalid. */
export function CheckedInput({
  className,
  error,
  onChange,
  ref: givenRef,
  ...props
}: Omit<React.ComponentProps<"input">, "onChange" | "ref" | "type"> & {
  readonly error: string | undefined;
  readonly onChange: (value: string) => void;
  /** For a page that also needs the field, such as to select it. */
  readonly ref?: React.RefObject<HTMLInputElement | null>;
}): React.JSX.Element {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = givenRef ?? ownRef;
  const tooltip = useRef<Tooltip>(undefined);

  useEffect(() => {
    const created = new Tooltip(ref.current!, { content: "" });
    tooltip.current = created;
    return () => {
      created.destroy();
      tooltip.current = undefined;
    };
  }, [ref]);

  // The fields depend on each other, and a change can move this one, so each render opens the
  // tooltip again at the field.
  useEffect(() => {
    const shown = tooltip.current!;
    if (error === undefined) {
      shown.close();
    } else {
      shown.setContent(escapeHtml(error));
      shown.open();
    }
  });

  return (
    <input
      {...props}
      className={[
        className,
        error !== undefined
          && "tw:border-2 tw:border-solid tw:border-(--error)",
      ]
        .filter(Boolean)
        .join(" ")}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      ref={ref}
      type="text"
    />
  );
}
