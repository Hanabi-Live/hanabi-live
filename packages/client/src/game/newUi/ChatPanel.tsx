import { useLayoutEffect, useRef } from "react";
import { CHAT_WINDOW_ID } from "../../Tooltip.ts";
import { tooltipRef, tooltipRefHtml } from "../../tooltipRef.ts";
import { GAME_CHAT_TEXT_ID } from "../GameChatBox.tsx";
import * as gameChat from "../chat.ts";
import {
  dockChat,
  focusChatWindow,
  getChatWindow,
  popOutChat,
} from "./chatWindow.ts";
import { KEY_CLASS } from "./surfaces.ts";

/**
 * The chat box's stylesheet uses the theme's colors. The game screen is dark in both themes, so the
 * panel gives the box the game screen's colors in their place. It sets each color that the dark
 * theme changes. A color such as "--chat-bg" that refers to another one gets its value on the
 * page's root, so the panel sets it too.
 */
const CHAT_BOX_COLORS = {
  "--chat-bg": "transparent",
  "--focus": "var(--game-screen-line)",
  "--green-text": "var(--game-screen-green-text)",
  "--error": "var(--game-screen-error)",
  "--text": "var(--game-screen-text)",
  "--text-strong": "var(--game-screen-text)",
  "--text-label": "var(--game-screen-muted)",
  "--text-faint": "var(--game-screen-muted)",
  "--surface": "var(--game-screen-panel)",
  "--surface-sunken": "var(--game-screen-bg)",
  "--border": "var(--game-screen-raised)",
  // Links are underlined. They are not in a color, because each color on the screen names a mode.
  "--link": "var(--game-screen-text)",
} as const;

/**
 * While the panel holds the classic chat box, these classes make it fill the panel instead of the
 * chat window. Tailwind utilities beat the site's stylesheets, so they override its rules.
 */
const BORROWED_CHAT_BOX_CLASSES = [
  "tw:static",
  "tw:m-0",
  "tw:size-full",
  "tw:px-4",
  "tw:pt-3",
  // The "is typing" note goes in the space below the chat box, so the box leaves room for it.
  "tw:pb-[26px]",
  // The site's text size changes with the window width, and at its largest it fits only a few words
  // on each line of the narrow panel. The text box sets its own size, so it gets the same size too.
  "tw:text-lg",
  "tw:[&_input]:text-lg",
  "tw:rounded-none",
  "tw:bg-transparent",
  "tw:shadow-none",
] as const;

const HEADER_BUTTON_CLASSES =
  "tw:flex tw:size-9 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:bg-transparent tw:text-game-muted tw:hover:bg-game-raised tw:hover:text-game-text";

/**
 * Moves the chat box from the classic chat window into the container. Returns a function that gives
 * it back, or nothing if the page has no chat box.
 */
function borrowChatBox(container: HTMLElement): (() => void) | undefined {
  const box = document.querySelector("#game-chat-modal-white");
  const modal = document.querySelector("#game-chat-modal");
  if (box === null || modal === null) {
    return undefined;
  }

  container.append(box);
  box.classList.add(...BORROWED_CHAT_BOX_CLASSES);
  const text = box.querySelector(`#${GAME_CHAT_TEXT_ID}`);
  if (text !== null) {
    text.scrollTop = text.scrollHeight;
  }

  return () => {
    box.classList.remove(...BORROWED_CHAT_BOX_CLASSES);
    modal.append(box);
  };
}

/**
 * Gives the chat window the page's stylesheets and theme, and moves the chat box into it. Returns a
 * function that gives the chat box back.
 */
function setUpChatWindow(chatWindow: Window): () => void {
  const chatDocument = chatWindow.document;
  chatDocument.title = `Chat - ${document.title.trim()}`;
  chatDocument.head.replaceChildren(
    ...[
      ...document.head.querySelectorAll(
        'link[rel~="stylesheet"], link[rel~="icon"], style',
      ),
    ].map((element) => element.cloneNode(true)),
  );

  // The colors of the chat box do not change with the theme, but its scroll bars and tooltips do.
  function copyTheme() {
    const { theme } = document.documentElement.dataset;
    if (theme === undefined) {
      delete chatDocument.documentElement.dataset["theme"];
    } else {
      chatDocument.documentElement.dataset["theme"] = theme;
    }
  }
  copyTheme();
  const themeObserver = new MutationObserver(copyTheme);
  themeObserver.observe(document.documentElement, {
    attributeFilter: ["data-theme"],
  });

  const container = chatDocument.createElement("div");
  container.id = CHAT_WINDOW_ID;
  container.className =
    "tw:fixed tw:inset-0 tw:bg-game-panel tw:text-game-text tw:select-none";
  for (const [name, value] of Object.entries(CHAT_BOX_COLORS)) {
    container.style.setProperty(name, value);
  }
  chatDocument.body.replaceChildren(container);
  const giveBack = borrowChatBox(container);
  focusChatWindow(true);

  return () => {
    themeObserver.disconnect();
    giveBack?.();
  };
}

/**
 * The in-game chat, along the right edge of the screen. It shows the same chat box as the classic
 * screen's chat window, which keeps its emoji, commands, typing indicator, and history. When it is
 * collapsed, a thin rail shows the unread messages and the spectators instead.
 */
export function ChatPanel({
  open,
  poppedOut,
  overlay,
  unread,
  spectators,
  spectatorsTooltip,
}: {
  readonly open: boolean;

  /** Whether the chat is in its own window. The panel then stays collapsed. */
  readonly poppedOut: boolean;

  /** Whether the open panel covers the table, on windows too narrow to fit both side by side. */
  readonly overlay: boolean;
  readonly unread: number;

  /** The names of the people watching the game. */
  readonly spectators: readonly string[];

  /** The tooltip of the spectator count, which lists the people watching, one per line. */
  readonly spectatorsTooltip: string;
}): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);

  // Borrow the chat box from the classic chat window while the panel is open, and give it back when
  // the panel closes, so that the classic screen can show it again.
  useLayoutEffect(() => {
    const container = boxRef.current;
    if (!open || poppedOut || container === null) {
      return undefined;
    }
    return borrowChatBox(container);
  }, [open, poppedOut]);

  // While the chat is popped out, its window borrows the chat box instead.
  useLayoutEffect(() => {
    const chatWindow = getChatWindow();
    if (!poppedOut || chatWindow === undefined) {
      return undefined;
    }

    const giveBack = setUpChatWindow(chatWindow);
    // The player closed the window, or reloaded it.
    chatWindow.addEventListener("pagehide", dockChat);
    // The window would stay open with nothing in it after we leave or reload the page.
    function closeChatWindow() {
      chatWindow!.close();
    }
    window.addEventListener("pagehide", closeChatWindow);

    return () => {
      chatWindow.removeEventListener("pagehide", dockChat);
      window.removeEventListener("pagehide", closeChatWindow);
      giveBack();
      // We also get here when we leave the game, and then the chat goes back to the panel too.
      dockChat();
    };
  }, [poppedOut]);

  const spectatorsLabel = `${spectators.length} watching`;

  if (!open || poppedOut) {
    let chatButtonLabel = poppedOut ? "Show chat window" : "Open chat";
    if (!poppedOut && unread > 0) {
      chatButtonLabel = `Open chat, ${unread} unread messages`;
    }
    return (
      <aside
        aria-label="Chat, collapsed"
        className="tw:flex tw:w-14 tw:shrink-0 tw:flex-col tw:items-center tw:gap-2.5 tw:border-l tw:border-game-raised tw:bg-game-panel tw:py-3.5"
      >
        <button
          aria-label={chatButtonLabel}
          className={`tw:relative tw:flex tw:size-11 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 tw:bg-game-raised tw:text-game-text tw:hover:bg-game-line ${KEY_CLASS}`}
          onClick={() => {
            if (poppedOut) {
              focusChatWindow(true);
            } else {
              gameChat.show();
            }
          }}
          ref={tooltipRef(poppedOut ? "Show chat window" : "Open chat")}
          type="button"
        >
          <i
            aria-hidden="true"
            className={`fas ${poppedOut ? "fa-external-link-alt" : "fa-comment"}`}
          />
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
            ref={tooltipRefHtml(spectatorsTooltip, { instant: true })}
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
        {/* With no one watching, the header stays blank. It names everyone, and wraps when the
            names need more than one line. */}
        <div className="tw:min-w-0 tw:flex-1 tw:leading-relaxed">
          {spectators.length > 0 && (
            <>
              <i aria-hidden="true" className="fas fa-eye tw:mr-1.5" />
              Watching ({spectators.length}):{" "}
              <span className="tw:text-game-text">{spectators.join(", ")}</span>
            </>
          )}
        </div>
        <button
          aria-label="Open chat in a new window"
          className={HEADER_BUTTON_CLASSES}
          onClick={popOutChat}
          ref={tooltipRef("Open chat in a new window")}
          type="button"
        >
          <i aria-hidden="true" className="fas fa-external-link-alt" />
        </button>
        <button
          aria-label="Collapse chat"
          className={HEADER_BUTTON_CLASSES}
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
        style={CHAT_BOX_COLORS as React.CSSProperties}
      />
    </aside>
  );
}
