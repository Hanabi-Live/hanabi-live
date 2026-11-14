import type {
  CardState,
  LogEntry,
  Rank,
  SuitIndex,
  Variant,
} from "@hanabi-live/game";
import { getCardName } from "@hanabi-live/game";
import { useEffect, useRef } from "react";
import { CARD_HEIGHT_PER_WIDTH, CardFace } from "./Card.tsx";
import type { ClueLogEntry } from "./ClueLog.tsx";
import { ClueDisc, getClueText } from "./ClueLog.tsx";

/** The width of the card at the start of a row, in CSS pixels. */
const ROW_CARD_WIDTH = 30;

/** The size of the disc at the start of the row of a clue, in CSS pixels. */
const ROW_DISC_SIZE = 22;

/**
 * The lines of the action log that a player's actions wrote. Each line starts with the name of the
 * player who acted. When one name starts with another (such as "Al" and "Alice"), the line belongs
 * to the longer name that it starts with.
 */
export function getPlayerLog(
  log: readonly LogEntry[],
  playerNames: readonly string[],
  playerIndex: number,
): readonly LogEntry[] {
  return log.filter((entry) => {
    let longest: number | undefined;
    for (const [i, name] of playerNames.entries()) {
      if (
        entry.text.startsWith(name)
        && (longest === undefined || name.length > playerNames[longest]!.length)
      ) {
        longest = i;
      }
    }
    return longest === playerIndex;
  });
}

/** A card that left a hand: played, misplayed, or discarded. */
type CardMove = "play" | "misplay" | "discard";

/** What the log adds about a card that left a hand. */
type CardNote = "clued" | "critical" | "blind";

type PlayerAction =
  | {
      readonly type: CardMove;
      /** The card, or nothing if the viewer may not know it (as in "Throw It in a Hole"). */
      readonly card:
        { readonly suitIndex: SuitIndex; readonly rank: Rank } | undefined;
      /** The slot that the card left (1 is the newest card), or nothing for the deck. */
      readonly slot: number | undefined;
      readonly note: CardNote | undefined;
    }
  | { readonly type: "clue"; readonly clue: ClueLogEntry }
  | {
      readonly type: "other";
      /** The line of the log, without the player's name. */
      readonly text: string;
    };

export interface PlayerActionEntry {
  readonly turn: number;
  readonly action: PlayerAction;
}

/** The words of the log for each way that a card leaves a hand. */
const CARD_MOVE_WORDS = {
  play: "plays",
  misplay: "fails to play",
  discard: "discards",
} as const satisfies Record<CardMove, string>;

/** The words of the log for a card whose identity it does not say. */
const HIDDEN_CARD_NAME = "a card";

/** A line of the log about a card that left a hand, without the player's name. */
const CARD_MOVE_PATTERN =
  /^ (discards|fails to play|plays) (.+) from (?:slot #(\d+)|the deck)(?: \((blind|clued|critical)\))?$/u;

/**
 * Reads a player's lines of the log (from `getPlayerLog`) as actions. The words of a line say what
 * the player did and what the viewer may know. The state of the game supplies the card or the clue
 * that a line names. A line that does not match them stays as text.
 */
export function getPlayerActions(
  entries: readonly LogEntry[],
  name: string,
  deck: readonly CardState[],
  clues: readonly ClueLogEntry[],
  variant: Variant,
): readonly PlayerActionEntry[] {
  return entries.map((entry) => {
    const rest = entry.text.slice(name.length);
    // The segment of an action is one less than the turn that the log gives it.
    const segment = entry.turn - 1;

    const match = CARD_MOVE_PATTERN.exec(rest);
    if (match !== null) {
      const [, words, cardName, slot, note] = match;
      const type = (Object.keys(CARD_MOVE_WORDS) as CardMove[]).find(
        (key) => CARD_MOVE_WORDS[key] === words,
      )!;
      const action = {
        type,
        slot: slot === undefined ? undefined : Number(slot),
        note: note as CardNote | undefined,
      };
      if (cardName === HIDDEN_CARD_NAME) {
        return {
          turn: entry.turn,
          action: {
            ...action,
            card: undefined,
          },
        };
      }

      const card = deck.find(
        (cardState) =>
          (type === "play"
            ? cardState.segmentPlayed
            : cardState.segmentDiscarded) === segment
          && cardState.suitIndex !== undefined
          && cardState.rank !== undefined
          && getCardName(cardState.suitIndex, cardState.rank, variant)
            === cardName,
      );
      if (card?.suitIndex !== undefined && card.rank !== undefined) {
        return {
          turn: entry.turn,
          action: {
            ...action,
            card: {
              suitIndex: card.suitIndex,
              rank: card.rank,
            },
          },
        };
      }
    }

    const clue = clues.find(
      (clueEntry) =>
        clueEntry.segment === segment
        && clueEntry.giverName === name
        && rest.includes(clueEntry.targetName),
    );
    if (clue !== undefined) {
      return {
        turn: entry.turn,
        action: {
          type: "clue",
          clue,
        },
      };
    }

    const text = rest.trim();
    return {
      turn: entry.turn,
      action: {
        type: "other",
        text: text.charAt(0).toUpperCase() + text.slice(1),
      },
    };
  });
}

/** The verb at the start of each row, and its color. */
const ACTION_VERB = {
  play: {
    text: "Played",
    className: "tw:text-[rgb(134_239_172)]",
  },
  misplay: {
    text: "Misplayed",
    className: "tw:text-[rgb(252_165_165)]",
  },
  discard: {
    text: "Discarded",
    className: "tw:text-game-text",
  },
  clue: {
    text: "Clued",
    className: "tw:text-game-text",
  },
} as const satisfies Record<
  CardMove | "clue",
  { readonly text: string; readonly className: string }
>;

/** The tag after the slot of a card, and its colors. */
const NOTE_TAG = {
  clued: {
    text: "Clued",
    className: "tw:bg-clue/20 tw:text-clue",
  },
  critical: {
    text: "Critical",
    className: "tw:bg-[rgb(248_113_113/22%)] tw:text-[rgb(252_165_165)]",
  },
  blind: {
    text: "Blind",
    className: "tw:bg-game-turn/20 tw:text-game-turn",
  },
} as const satisfies Record<
  CardNote,
  { readonly text: string; readonly className: string }
>;

/** Counts the actions of each type, as words, such as "2 plays, 1 discard, 4 clues". */
function getTally(entries: readonly PlayerActionEntry[]): string {
  const words = [
    ["play", "play", "plays"],
    ["misplay", "misplay", "misplays"],
    ["discard", "discard", "discards"],
    ["clue", "clue", "clues"],
  ] as const;
  return words
    .map(([type, one, many]) => {
      const count = entries.filter(
        (entry) => entry.action.type === type,
      ).length;
      return count === 0 ? "" : `${count} ${count === 1 ? one : many}`;
    })
    .filter((part) => part !== "")
    .join(", ");
}

/**
 * A list of every action that one player took up to the turn that shows. Clicking a player's name
 * opens it. Each row shows the card that the player played or discarded, or the clue that they
 * gave, and is a button that shows the turn after it. Clicking outside of the list or pressing
 * Escape closes it.
 */
export function PlayerLog({
  name,
  entries,
  variant,
  colorblindMode,
  onShowTurn,
  onClose,
}: {
  readonly name: string;
  readonly entries: readonly PlayerActionEntry[];
  readonly variant: Variant;
  readonly colorblindMode: boolean;
  /** Shows the state of the game after the action of a turn. */
  readonly onShowTurn: (turn: number) => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // The newest action is the one that a player most often wants, so the list starts at its end.
  useEffect(() => {
    const list = listRef.current;
    if (list !== null) {
      list.scrollTop = list.scrollHeight;
    }
  }, [entries]);

  const tally = getTally(entries);

  return (
    <div
      className="tw:absolute tw:inset-0 tw:z-40 tw:flex tw:items-center tw:justify-center tw:bg-[rgb(0_0_0/50%)] tw:p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-label={`${name}'s actions`}
        aria-modal="true"
        className="tw:flex tw:max-h-full tw:w-[440px] tw:max-w-full tw:flex-col tw:rounded-game-panel tw:bg-game-panel tw:shadow-2xl tw:ring-1 tw:ring-game-line tw:outline-none"
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="tw:flex tw:items-start tw:gap-3 tw:py-3 tw:pr-2 tw:pl-5">
          <div className="tw:min-w-0 tw:flex-1">
            <h2 className="tw:m-0 tw:truncate tw:text-[18px] tw:leading-tight tw:font-bold tw:text-game-text">
              {name}&apos;s actions
            </h2>
            {tally !== "" && (
              <p className="tw:m-0 tw:mt-0.5 tw:text-[13px] tw:text-game-muted">
                {tally}
              </p>
            )}
          </div>
          <button
            aria-label="Close"
            className="tw:flex tw:size-9 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:bg-transparent tw:text-game-muted tw:hover:bg-white/10 tw:hover:text-game-text"
            onClick={onClose}
            type="button"
          >
            <i aria-hidden="true" className="fas fa-times" />
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="tw:m-0 tw:px-5 tw:pt-1 tw:pb-6 tw:text-game-muted">
            {name} has not taken any actions yet.
          </p>
        ) : (
          <ol
            // The rows sit in a well, like the clue log, so that they read as a record and not as a
            // menu of choices.
            className="tw:m-0 tw:mx-3 tw:mb-3 tw:grid tw:min-h-0 tw:list-none tw:grid-cols-[auto_auto_minmax(0,1fr)] tw:content-start tw:gap-y-px tw:overflow-y-auto tw:rounded-game-control tw:bg-game-well tw:p-1.5 tw:[scrollbar-color:var(--game-screen-line)_transparent] tw:[scrollbar-width:thin]"
            ref={listRef}
          >
            {entries.map((entry, i) => (
              <li
                className="tw:col-span-full tw:grid tw:grid-cols-subgrid"
                key={i}
              >
                <button
                  className="tw:col-span-full tw:grid tw:cursor-pointer tw:grid-cols-subgrid tw:items-center tw:gap-x-3 tw:rounded-game-control tw:border-0 tw:bg-transparent tw:py-1.5 tw:pr-3 tw:pl-2 tw:text-left tw:text-game-text tw:hover:bg-white/10"
                  onClick={() => {
                    onShowTurn(entry.turn);
                  }}
                  type="button"
                >
                  <span className="tw:min-w-[3ch] tw:text-right tw:text-[13px] tw:text-game-muted tw:tabular-nums">
                    #{entry.turn}
                  </span>
                  <ActionMark
                    action={entry.action}
                    colorblindMode={colorblindMode}
                    variant={variant}
                  />
                  <ActionText action={entry.action} variant={variant} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/** The picture at the start of a row: the card, the clue, or an icon for any other action. */
function ActionMark({
  action,
  variant,
  colorblindMode,
}: {
  readonly action: PlayerAction;
  readonly variant: Variant;
  readonly colorblindMode: boolean;
}): React.JSX.Element {
  // Every mark takes the room of a card, so that the text of the rows lines up.
  const box = {
    width: ROW_CARD_WIDTH,
    height: ROW_CARD_WIDTH * CARD_HEIGHT_PER_WIDTH,
  };

  switch (action.type) {
    case "play":
    case "misplay":
    case "discard": {
      return (
        <span aria-hidden="true" className="tw:relative tw:flex" style={box}>
          <CardFace
            colorblindMode={colorblindMode}
            rank={action.card?.rank}
            suitIndex={action.card?.suitIndex}
            variant={variant}
            width={ROW_CARD_WIDTH}
          />
          {/* A misplay costs a strike, so its card gets the strike's mark. */}
          {action.type === "misplay" && (
            <span className="tw:absolute tw:-right-1.5 tw:-bottom-1.5 tw:flex tw:size-4.5 tw:items-center tw:justify-center tw:rounded-full tw:bg-[rgb(220_38_38)] tw:text-[10px] tw:text-white tw:ring-2 tw:ring-game-panel">
              <i className="fas fa-times" />
            </span>
          )}
        </span>
      );
    }

    case "clue": {
      return (
        <span className="tw:flex tw:items-center tw:justify-center" style={box}>
          <ClueDisc
            clueName={action.clue.clueName}
            marker={action.clue.marker}
            size={ROW_DISC_SIZE}
          />
        </span>
      );
    }

    case "other": {
      return (
        <span
          aria-hidden="true"
          className="tw:flex tw:items-center tw:justify-center tw:text-game-muted"
          style={box}
        >
          <i className="fas fa-circle tw:text-[6px]" />
        </span>
      );
    }
  }
}

/** The words of a row: what the player did on the first line, and the details on the second. */
function ActionText({
  action,
  variant,
}: {
  readonly action: PlayerAction;
  readonly variant: Variant;
}): React.JSX.Element {
  switch (action.type) {
    case "play":
    case "misplay":
    case "discard": {
      const verb = ACTION_VERB[action.type];
      const cardName =
        action.card === undefined
          ? HIDDEN_CARD_NAME
          : getCardName(action.card.suitIndex, action.card.rank, variant);
      return (
        <span className="tw:min-w-0">
          <span className="tw:block tw:truncate tw:text-[15px]">
            <span className={`tw:font-bold ${verb.className}`}>
              {verb.text}
            </span>{" "}
            {cardName}
          </span>
          <span className="tw:mt-0.5 tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:text-game-muted">
            {action.slot === undefined
              ? "From the deck"
              : `Slot ${action.slot}`}
            {action.note !== undefined && (
              <span
                className={`tw:rounded-full tw:px-2 tw:text-[12px] tw:leading-[18px] tw:font-semibold ${NOTE_TAG[action.note].className}`}
              >
                {NOTE_TAG[action.note].text}
              </span>
            )}
          </span>
        </span>
      );
    }

    case "clue": {
      const { clue } = action;
      const touched = clue.touchedCards.length;
      return (
        <span className="tw:min-w-0">
          <span className="tw:block tw:truncate tw:text-[15px]">
            <span className={`tw:font-bold ${ACTION_VERB.clue.className}`}>
              {ACTION_VERB.clue.text}
            </span>{" "}
            {clue.targetName}
          </span>
          <span className="tw:mt-0.5 tw:block tw:text-[13px] tw:text-game-muted">
            {getClueText(clue)},{" "}
            {touched === 0
              ? "touching no cards"
              : `touching ${touched} ${touched === 1 ? "card" : "cards"}`}
          </span>
        </span>
      );
    }

    case "other": {
      return <span className="tw:text-[15px]">{action.text}</span>;
    }
  }
}
