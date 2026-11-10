import { useLayoutEffect, useRef } from "react";
import * as gameChat from "../chat";

/**
 * While the panel holds the classic chat box, these classes make it fill the panel instead of the
 * chat window. Tailwind utilities beat the site's stylesheets, so they override its rules.
 */
const BORROWED_CHAT_BOX_CLASSES = [
  "tw:static",
  "tw:m-0",
  "tw:size-full",
  "tw:px-4",
  "tw:py-3",
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
  numPlayers,
  numSpectators,
}: {
  readonly open: boolean;
  readonly unread: number;
  readonly numPlayers: number;
  readonly numSpectators: number;
}): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);

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

  const spectatorsLabel = `${numSpectators} watching`;

  if (!open) {
    return (
      <aside
        aria-label="Chat, collapsed"
        className="tw:flex tw:w-14 tw:shrink-0 tw:flex-col tw:items-center tw:gap-2.5 tw:border-l tw:border-border tw:bg-surface-panel tw:py-3.5"
      >
        <button
          aria-label={
            unread > 0 ? `Open chat, ${unread} unread messages` : "Open chat"
          }
          className="tw:relative tw:flex tw:size-11 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-[10px] tw:border-0 tw:bg-border tw:text-text-strong tw:hover:brightness-95"
          onClick={() => {
            gameChat.show();
          }}
          title="Open chat"
          type="button"
        >
          <i aria-hidden="true" className="fas fa-comment" />
          {unread > 0 && (
            <span className="tw:absolute tw:-top-1 tw:-right-1 tw:flex tw:h-5 tw:min-w-5 tw:items-center tw:justify-center tw:rounded-full tw:bg-clue tw:px-1.5 tw:text-xs tw:font-bold tw:text-card-ink">
              {unread}
            </span>
          )}
        </button>
        <div
          className="tw:flex tw:flex-col tw:items-center tw:gap-0.5 tw:text-[13px] tw:text-text-label"
          title={spectatorsLabel}
        >
          <i aria-hidden="true" className="fas fa-eye" />
          <span aria-label={spectatorsLabel}>{numSpectators}</span>
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Chat"
      className="tw:flex tw:w-[320px] tw:shrink-0 tw:flex-col tw:border-l tw:border-border tw:bg-surface-panel"
    >
      <header className="tw:flex tw:items-center tw:justify-between tw:border-b tw:border-border-panel tw:py-3.5 tw:pr-2 tw:pl-5 tw:text-sm tw:text-text-label">
        <span>
          {numPlayers} players, {spectatorsLabel}
          <i aria-hidden="true" className="fas fa-eye tw:ml-1.5" />
        </span>
        <button
          aria-label="Collapse chat"
          className="tw:flex tw:size-9 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-lg tw:border-0 tw:bg-transparent tw:text-text-label tw:hover:bg-border tw:hover:text-text-strong"
          onClick={() => {
            gameChat.hide();
          }}
          title="Collapse chat"
          type="button"
        >
          <i aria-hidden="true" className="fas fa-angle-double-right" />
        </button>
      </header>
      <div className="tw:min-h-0 tw:flex-1" ref={boxRef} />
    </aside>
  );
}
