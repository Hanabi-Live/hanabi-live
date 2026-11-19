// A box that filters a list of games by part of a name, such as a variant's or a player's. It can
// suggest names in a list under it as the player types.

import { MAX_GAME_SEARCH_LENGTH } from "@hanabi-live/data";
import { useId, useState } from "react";
import { SuggestBox } from "../SuggestBox.tsx";
import { useDelayedCallback } from "../useDelayedCallback.ts";

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
  const inputId = useId();
  const filterLater = useDelayedCallback((value: string) => {
    onChange(value.trim());
  });

  // The label does not hold the list, so that its names are not part of the box's name.
  return (
    <div className="tw:flex tw:min-w-0 tw:items-center tw:gap-2">
      <label
        className="tw:m-0 tw:text-[1em] tw:text-text-label"
        htmlFor={inputId}
      >
        {label}
      </label>
      <SuggestBox
        autoCapitalize="off"
        className={`tw:h-8 tw:max-w-full tw:px-3 tw:text-[1em] ${widthClassName}`}
        id={inputId}
        maxLength={MAX_GAME_SEARCH_LENGTH}
        onPick={(name) => {
          setText(name);
          filterLater(name, 0);
        }}
        onType={(value) => {
          setText(value);
          filterLater(value);
        }}
        placeholder={placeholder}
        spellCheck={false}
        suggest={suggest}
        value={text}
      />
    </div>
  );
}
