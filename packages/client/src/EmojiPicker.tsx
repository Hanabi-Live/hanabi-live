// The picker that adds emotes and emoji to a chat input. It shows one tab at a time, because
// drawing every emote and emoji at once makes the browser stop for seconds.

import { CHAT_EMOJI_GROUPS, CHAT_EMOTES } from "@hanabi-live/data";
import { useState } from "react";
import { renderRoot } from "./renderRoot.tsx";
import { TAB_CLASS_NAME } from "./tabClassName.ts";

/** Searching for a short string matches most symbols, and drawing them all would be slow. */
const MAX_SEARCH_RESULTS = 100;

interface ChatSymbol {
  /** What chat shows as the symbol's name, such as "Kappa" or ":smile:". */
  readonly title: string;
  /** What picking the symbol adds to the chat input. */
  readonly text: string;
  readonly emoji?: string;
  readonly imagePath?: string;
}

interface SymbolTab {
  readonly label: string;
  readonly symbols: readonly ChatSymbol[];
}

const EMOTE_TABS = [
  { category: "twitch", label: "Twitch" },
  { category: "betterttv", label: "BetterTTV" },
  { category: "frankerfacez", label: "FrankerFaceZ" },
  { category: "frankerfacez-custom", label: "Custom" },
] as const satisfies ReadonlyArray<{
  readonly category: keyof typeof CHAT_EMOTES;
  readonly label: string;
}>;

/** Shorter names for the Unicode emoji groups, so that the tabs fit on fewer lines. */
const EMOJI_GROUP_LABELS = {
  "Smileys & Emotion": "Smileys",
  "People & Body": "People",
  "Animals & Nature": "Nature",
  "Food & Drink": "Food",
  "Travel & Places": "Travel",
  Activities: "Activities",
  Objects: "Objects",
  Symbols: "Symbols",
} as const satisfies Record<keyof typeof CHAT_EMOJI_GROUPS, string>;

const TABS = [
  ...EMOTE_TABS.map(({ category, label }) => ({
    label,
    symbols: CHAT_EMOTES[category].map((emote): ChatSymbol => ({
      title: emote,
      text: `${emote} `,
      imagePath: `${category}/${emote}`,
    })),
  })),
  ...Object.entries(CHAT_EMOJI_GROUPS).map(([group, emojis]) => ({
    label: EMOJI_GROUP_LABELS[group as keyof typeof EMOJI_GROUP_LABELS],
    symbols: Object.entries(emojis).map(([name, emoji]): ChatSymbol => ({
      title: `:${name}:`,
      text: emoji,
      emoji,
    })),
  })),
] as const satisfies readonly SymbolTab[];

const ALL_SYMBOLS: readonly ChatSymbol[] = TABS.flatMap((tab) => tab.symbols);

const BUTTON_CLASS_NAME =
  "tw:flex tw:h-10 tw:min-w-10 tw:cursor-pointer tw:appearance-none tw:items-center tw:justify-center tw:rounded tw:border-0 tw:bg-transparent tw:p-1 tw:hover:bg-surface-sunken";

/** Renders the picker into an element. `onPick` receives the text to add to the chat input. */
export function mountEmojiPicker(
  container: HTMLElement,
  onPick: (text: string) => void,
): void {
  renderRoot(container, <EmojiPicker onPick={onPick} />);
}

function EmojiPicker({
  onPick,
}: {
  readonly onPick: (text: string) => void;
}): React.JSX.Element {
  const [tabIndex, setTabIndex] = useState(0);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const symbols =
    query === ""
      ? (TABS[tabIndex]?.symbols ?? [])
      : ALL_SYMBOLS.filter((symbol) =>
          symbol.title.toLowerCase().includes(query),
        ).slice(0, MAX_SEARCH_RESULTS);

  return (
    <div className="tw:flex tw:w-[min(34em,70vw)] tw:flex-col tw:gap-2">
      <input
        aria-label="Search emotes and emoji"
        autoComplete="off"
        onChange={(event) => {
          setSearch(event.target.value);
        }}
        placeholder="Search"
        type="text"
        value={search}
      />
      <div
        className="tw:flex tw:flex-wrap tw:gap-x-[1.1em] tw:gap-y-1"
        role="tablist"
      >
        {TABS.map((tab, i) => (
          <button
            aria-selected={query === "" && i === tabIndex}
            className={TAB_CLASS_NAME}
            key={tab.label}
            onClick={() => {
              setTabIndex(i);
              setSearch("");
            }}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div
        className="tw:flex tw:h-[45vh] tw:flex-wrap tw:content-start tw:overflow-y-auto"
        role="tabpanel"
      >
        {symbols.map((symbol) => (
          <button
            className={BUTTON_CLASS_NAME}
            key={symbol.title}
            onClick={() => {
              onPick(symbol.text);
            }}
            title={symbol.title}
            type="button"
          >
            {symbol.imagePath === undefined ? (
              <EmojiText emoji={symbol.emoji ?? ""} />
            ) : (
              <EmoteImage path={symbol.imagePath} />
            )}
          </button>
        ))}
        {symbols.length === 0 && (
          <p className="tw:m-2 tw:text-text-label">No matches.</p>
        )}
      </div>
    </div>
  );
}

function EmoteImage({ path }: { readonly path: string }): React.JSX.Element {
  return (
    <img
      alt=""
      className="tw:h-8"
      decoding="async"
      loading="lazy"
      src={`/public/img/emotes/${path}.png`}
    />
  );
}

function EmojiText({ emoji }: { readonly emoji: string }): React.JSX.Element {
  return <span className="tw:text-[1.6em] tw:leading-none">{emoji}</span>;
}
