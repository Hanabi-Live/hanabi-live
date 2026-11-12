import { useLayoutEffect, useRef, useState } from "react";
import { tooltipRef, tooltipRefHtml } from "../../tooltipRef.ts";
import * as gameChat from "../chat.ts";

/**
 * While the panel holds the classic chat box, these classes make it fill the panel instead of the
 * chat window. Tailwind utilities beat the site's stylesheets, so they override its rules.
 */
/**
 * The text of the header's line about the people watching, when it names the first `listed` of
 * them. The rest are "and # others", a button that names them all.
 */
function getWatchingText(names: readonly string[], listed: number): string {
  const hidden = names.length - listed;
  const others = hidden === 1 ? "other" : "others";
  const rest = hidden > 0 ? `, and ${hidden} ${others}` : "";
  return `Watching (${names.length}): ${names.slice(0, listed).join(", ")}${rest}`;
}

/**
 * The chat box's stylesheet uses the theme's colors. The game screen is dark in both themes, so the
 * panel gives the box the game screen's colors in their place.
 */
const CHAT_BOX_COLORS = {
  "--text": "var(--game-screen-text)",
  "--text-strong": "var(--game-screen-text)",
  "--text-label": "var(--game-screen-muted)",
  "--text-faint": "var(--game-screen-muted)",
  "--surface": "var(--game-screen-panel)",
  "--surface-sunken": "var(--game-screen-bg)",
  "--border": "var(--game-screen-raised)",
  "--link": "var(--game-screen-link)",
} as React.CSSProperties;

const BORROWED_CHAT_BOX_CLASSES = [
  "tw:static",
  "tw:m-0",
  "tw:size-full",
  "tw:px-4",
  "tw:pt-3",
  // The "is typing" note goes in the space below the chat box, so the box leaves room for it.
  "tw:pb-[26px]",
  "tw:rounded-none",
  "tw:bg-transparent",
  "tw:shadow-none",
] as const;

/**
 * The in-game chat, along the right edge of the screen. It shows the same chat box as the classic
 * screen's chat window, which keeps its emoji, commands, typing indicator, and history. When it is
 * collapsed, a thin rail shows the unread messages and the spectators instead.
 */
export function ChatPanel({
  open,
  unread,
  spectators,
  spectatorsTooltip,
  overlay,
}: {
  readonly open: boolean;

  /** Whether the open panel covers the table, on windows too narrow to fit both side by side. */
  readonly overlay: boolean;
  readonly unread: number;

  /** The names of the people watching the game. */
  readonly spectators: readonly string[];

  /** The tooltip of the spectator count, which lists the people watching, one per line. */
  readonly spectatorsTooltip: string;
}): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);
  const [showAllSpectators, setShowAllSpectators] = useState(false);

  // Borrow the chat box from the classic chat window while the panel is open, and give it back when
  // the panel closes, so that the classic screen can show it again.
  useLayoutEffect(() => {
    const box = document.querySelector("#game-chat-modal-white");
    const modal = document.querySelector("#game-chat-modal");
    const container = boxRef.current;
    if (!open || box === null || modal === null || container === null) {
      return undefined;
    }

    container.append(box);
    box.classList.add(...BORROWED_CHAT_BOX_CLASSES);
    const text = document.querySelector("#game-chat-text");
    if (text !== null) {
      text.scrollTop = text.scrollHeight;
    }

    return () => {
      box.classList.remove(...BORROWED_CHAT_BOX_CLASSES);
      modal.append(box);
    };
  }, [open]);

  // The header names as many of the people watching as fit on one line. It tries every name, then
  // drops one at a time, with "and # others" in their place, until the line fits. It measures the
  // text in a hidden copy of the line, and again when the panel changes size.
  const watchingLineRef = useRef<HTMLDivElement>(null);
  const watchingMeasureRef = useRef<HTMLSpanElement>(null);
  const [fittingSpectators, setFittingSpectators] = useState(spectators.length);
  const spectatorsKey = spectators.join("\n");
  useLayoutEffect(() => {
    const line = watchingLineRef.current;
    const measure = watchingMeasureRef.current;
    if (line === null || measure === null) {
      return undefined;
    }
    const names = spectatorsKey === "" ? [] : spectatorsKey.split("\n");
    const text = measure.querySelector("[data-watching-text]");
    if (text === null) {
      return undefined;
    }

    function fit() {
      if (line === null || measure === null || text === null) {
        return;
      }
      let listed = names.length;
      while (listed > 1) {
        text.textContent = getWatchingText(names, listed);
        if (measure.offsetWidth <= line.clientWidth) {
          break;
        }
        listed--;
      }
      setFittingSpectators(listed);
    }

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(line);
    return () => {
      observer.disconnect();
    };
  }, [spectatorsKey, open]);

  const spectatorsLabel = `${spectators.length} watching`;
  const listedSpectators = showAllSpectators
    ? spectators
    : spectators.slice(0, fittingSpectators);
  const hiddenSpectators = spectators.length - listedSpectators.length;

  if (!open) {
    return (
      <aside
        aria-label="Chat, collapsed"
        className="tw:flex tw:w-14 tw:shrink-0 tw:flex-col tw:items-center tw:gap-2.5 tw:border-l tw:border-game-raised tw:bg-game-panel tw:py-3.5"
      >
        <button
          aria-label={
            unread > 0 ? `Open chat, ${unread} unread messages` : "Open chat"
          }
          className="tw:relative tw:flex tw:size-11 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[10px] tw:border-0 tw:bg-game-raised tw:text-game-text tw:hover:bg-game-line"
          onClick={() => {
            gameChat.show();
          }}
          ref={tooltipRef("Open chat")}
          type="button"
        >
          <i aria-hidden="true" className="fas fa-comment" />
          {unread > 0 && (
            <span className="tw:absolute tw:-top-1 tw:-right-1 tw:flex tw:h-5 tw:min-w-5 tw:items-center tw:justify-center tw:rounded-full tw:bg-clue tw:px-1.5 tw:text-xs tw:font-bold tw:text-card-ink">
              {unread}
            </span>
          )}
        </button>
        {/* Only a count: the open panel's header names the people watching. */}
        {spectators.length > 0 && (
          <div
            aria-label={spectatorsLabel}
            className="tw:flex tw:flex-col tw:items-center tw:gap-0.5 tw:px-2 tw:py-1 tw:text-[13px] tw:text-game-muted"
            ref={tooltipRefHtml(spectatorsTooltip)}
            role="img"
          >
            <i aria-hidden="true" className="fas fa-eye" />
            {spectators.length}
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      aria-label="Chat"
      className={`tw:flex tw:w-[320px] tw:max-w-full tw:shrink-0 tw:flex-col tw:border-l tw:border-game-raised tw:bg-game-panel ${
        overlay
          ? "tw:absolute tw:inset-y-0 tw:right-0 tw:z-20 tw:shadow-2xl"
          : ""
      }`}
    >
      <header className="tw:flex tw:items-start tw:gap-2 tw:border-b tw:border-game-zone tw:py-3.5 tw:pr-2 tw:pl-5 tw:text-sm tw:text-game-muted">
        {/* With no one watching, the header stays blank. */}
        <div
          className="tw:relative tw:min-w-0 tw:flex-1 tw:leading-relaxed"
          ref={watchingLineRef}
        >
          {/* A hidden copy of the line, on one line, to measure how many names fit. */}
          <span
            aria-hidden="true"
            className="tw:invisible tw:absolute tw:top-0 tw:left-0 tw:whitespace-nowrap"
            ref={watchingMeasureRef}
          >
            <i className="fas fa-eye tw:mr-1.5" />
            <span data-watching-text />
          </span>
          {spectators.length > 0 && (
            <>
              <i aria-hidden="true" className="fas fa-eye tw:mr-1.5" />
              Watching ({spectators.length}):{" "}
              <span className="tw:text-game-text">
                {listedSpectators.join(", ")}
                {hiddenSpectators > 0 && ","}
              </span>
              {hiddenSpectators > 0 && (
                <>
                  {" "}
                  <button
                    className="tw:cursor-pointer tw:border-0 tw:bg-transparent tw:p-0 tw:[font:inherit] tw:text-game-text tw:underline"
                    onClick={() => {
                      setShowAllSpectators(true);
                    }}
                    type="button"
                  >
                    and {hiddenSpectators}{" "}
                    {hiddenSpectators === 1 ? "other" : "others"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
        <button
          aria-label="Collapse chat"
          className="tw:flex tw:size-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-lg tw:border-0 tw:bg-transparent tw:text-game-muted tw:hover:bg-game-raised tw:hover:text-game-text"
          onClick={() => {
            gameChat.hide();
          }}
          ref={tooltipRef("Collapse chat")}
          type="button"
        >
          <i aria-hidden="true" className="fas fa-angle-double-right" />
        </button>
      </header>
      <div
        className="tw:min-h-0 tw:flex-1"
        ref={boxRef}
        style={CHAT_BOX_COLORS}
      />
    </aside>
  );
}
