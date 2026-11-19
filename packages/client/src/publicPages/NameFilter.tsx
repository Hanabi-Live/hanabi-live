// A box that filters a list of games by part of a name, such as a variant's or a player's. It can
// suggest names in a list under it as the player types.

import { MAX_GAME_SEARCH_LENGTH } from "@hanabi-live/data";
import { VARIANT_NAMES } from "@hanabi-live/game";
import { useEffect, useId, useRef, useState } from "react";

/** How long to wait after the last keystroke before filtering. */
const FILTER_DELAY_MILLISECONDS = 300;

/** The most names that the list suggests at once, so that it does not cover the games. */
const MAX_SUGGESTIONS = 8;

export function NameFilter({
  label,
  placeholder,
  widthClassName,
  suggest,
  onChange,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly widthClassName: string;
  /** The names that a list under the box suggests for its text. Without it, the box has no list. */
  readonly suggest?: (text: string) => readonly string[];
  /** Receives the trimmed text, once the typing pauses or a suggestion is picked. */
  readonly onChange: (text: string) => void;
}): React.JSX.Element {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  /** The suggestion that the arrow keys picked, or -1 for none. */
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const listId = useId();
  const inputId = useId();
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const suggestions = suggest?.(text) ?? [];
  const shown = open && suggestions.length > 0;

  function filter(value: string, delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onChange(value.trim());
    }, delay);
  }

  /** Puts a suggested name in the box, and filters by it at once. */
  function pick(name: string) {
    setText(name);
    setOpen(false);
    setActive(-1);
    filter(name, 0);
  }

  // The label does not hold the list, so that its names are not part of the box's name. The list
  // hangs from the box.
  return (
    <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
      <label
        className="tw:m-0 tw:text-[1em] tw:text-text-label"
        htmlFor={inputId}
      >
        {label}
      </label>
      <div className="tw:relative tw:min-w-0">
        <input
          {...(suggest !== undefined && {
            "aria-activedescendant":
              shown && active >= 0 ? `${listId}-${active}` : undefined,
            "aria-autocomplete": "list",
            "aria-controls": listId,
            "aria-expanded": shown,
            role: "combobox",
          })}
          autoCapitalize="off"
          autoComplete="off"
          className={`tw:h-8 tw:max-w-full tw:px-3 tw:text-[1em] ${widthClassName}`}
          id={inputId}
          maxLength={MAX_GAME_SEARCH_LENGTH}
          onBlur={() => {
            setOpen(false);
          }}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
            filter(event.target.value, FILTER_DELAY_MILLISECONDS);
          }}
          onFocus={() => {
            setOpen(true);
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
          placeholder={placeholder}
          spellCheck={false}
          type="text"
          value={text}
        />
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
                // The box would lose its focus on a click, and close the list before the click
                // lands.
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(name);
                }}
                role="option"
              >
                <Highlighted name={name} term={text.trim()} />
              </li>
            ))}
          </ul>
        )}
      </div>
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
