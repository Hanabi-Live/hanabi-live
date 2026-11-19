// A text box that suggests names in a list under it as the player types, such as variant names. The
// page draws the list, so that it matches the site, unlike the browser's list of a `<datalist>`.

import { VARIANT_NAMES } from "@hanabi-live/game";
import type { ComponentProps } from "react";
import { useId, useState } from "react";

/** The most names that the list suggests at once, so that it does not cover what is under it. */
const MAX_SUGGESTIONS = 8;

export function SuggestBox({
  children,
  value,
  suggest,
  onType,
  onPick,
  ...props
}: Omit<ComponentProps<"input">, "onChange" | "value"> & {
  readonly value: string;
  /** The names that the list suggests for the text. Without it, the box has no list. */
  readonly suggest?: (text: string) => readonly string[];
  /** The player typed in the box. */
  readonly onType: (text: string) => void;
  /** The player picked a suggested name, which is now the text. */
  readonly onPick: (name: string) => void;
  /** Other things over the box, such as an icon. */
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  /** The suggestion that the arrow keys picked, or -1 for none. */
  const [active, setActive] = useState(-1);
  const listId = useId();

  const suggestions = suggest?.(value) ?? [];
  const shown = open && suggestions.length > 0;

  function pick(name: string) {
    setOpen(false);
    setActive(-1);
    onPick(name);
  }

  // The list hangs from the box.
  return (
    <div className="tw:relative tw:min-w-0">
      <input
        {...props}
        {...(suggest !== undefined && {
          "aria-activedescendant":
            shown && active >= 0 ? `${listId}-${active}` : undefined,
          "aria-autocomplete": "list",
          "aria-controls": listId,
          "aria-expanded": shown,
          role: "combobox",
        })}
        autoComplete="off"
        onBlur={(event) => {
          setOpen(false);
          props.onBlur?.(event);
        }}
        onChange={(event) => {
          setOpen(true);
          setActive(-1);
          onType(event.target.value);
        }}
        onFocus={(event) => {
          setOpen(true);
          props.onFocus?.(event);
        }}
        onKeyDown={(event) => {
          switch (event.key) {
            case "ArrowDown": {
              if (suggestions.length > 0) {
                event.preventDefault();
                setOpen(true);
                setActive((active + 1) % suggestions.length);
              }
              break;
            }

            case "ArrowUp": {
              if (suggestions.length > 0) {
                event.preventDefault();
                setOpen(true);
                setActive((active <= 0 ? suggestions.length : active) - 1);
              }
              break;
            }

            case "Enter": {
              const name = shown ? suggestions[active] : undefined;
              if (name !== undefined) {
                event.preventDefault();
                pick(name);
              }
              break;
            }

            case "Escape": {
              if (shown) {
                event.preventDefault();
                setOpen(false);
                setActive(-1);
              }
              break;
            }

            default: {
              break;
            }
          }
        }}
        type="text"
        value={value}
      />
      {children}
      {suggest !== undefined && (
        <ul
          className="tw:absolute tw:top-full tw:left-0 tw:z-20 tw:m-0 tw:mt-1 tw:w-max tw:max-w-[min(24em,calc(100vw-2em))] tw:min-w-full tw:list-none tw:rounded-[var(--radius)] tw:border tw:border-solid tw:border-border tw:bg-surface tw:p-1 tw:shadow-lg"
          hidden={!shown}
          id={listId}
          role="listbox"
        >
          {suggestions.map((name, index) => (
            <li
              aria-selected={index === active}
              className={`tw:cursor-pointer tw:truncate tw:rounded-[var(--radius)] tw:px-2.5 tw:py-1.5 tw:hover:bg-[var(--row-hover-bg)] ${index === active ? "tw:bg-[var(--row-hover-bg)]" : ""}`}
              id={`${listId}-${index}`}
              key={name}
              // The box would lose its focus on a click, and close the list before the click lands.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(name);
              }}
              role="option"
            >
              <Highlighted name={name} term={value.trim()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A suggested name with the part that matches the text in the box in bold. */
function Highlighted({
  name,
  term,
}: {
  readonly name: string;
  readonly term: string;
}) {
  const start = name.toLowerCase().indexOf(term.toLowerCase());
  if (start === -1 || term === "") {
    return <>{name}</>;
  }
  const end = start + term.length;
  return (
    <>
      {name.slice(0, start)}
      <strong>{name.slice(start, end)}</strong>
      {name.slice(end)}
    </>
  );
}

/**
 * The variant names that contain the text, ignoring case, with the names that start with it first.
 * A name that the text already spells out in full is left out.
 */
export function suggestVariants(text: string): readonly string[] {
  const lowercase = text.trim().toLowerCase();
  if (lowercase === "") {
    return [];
  }
  const matches = VARIANT_NAMES.filter((name) => {
    const lowercaseName = name.toLowerCase();
    return lowercaseName !== lowercase && lowercaseName.includes(lowercase);
  });
  const starts = matches.filter((name) =>
    name.toLowerCase().startsWith(lowercase),
  );
  const others = matches.filter(
    (name) => !name.toLowerCase().startsWith(lowercase),
  );
  return [...starts, ...others].slice(0, MAX_SUGGESTIONS);
}
