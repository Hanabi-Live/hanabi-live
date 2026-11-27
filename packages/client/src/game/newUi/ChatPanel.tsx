import { Fragment, useLayoutEffect, useRef } from "react";
import { SpectatorsIcon } from "../../SpectatorsIcon.tsx";
import { CHAT_WINDOW_ID } from "../../Tooltip.ts";
import { useReducedMotion } from "../../fade.ts";
import { tooltipRef, tooltipRefHtml } from "../../tooltipRef.ts";
import { GAME_CHAT_TEXT_ID } from "../GameChatBox.tsx";
import * as gameChat from "../chat.ts";
import { toggleZen } from "../zen.ts";
import {
  FADE_LAYER_PARENT_CLASS,
  FadeLayer,
  getButtonTextColorStyle,
} from "./FadeLayer.tsx";
import {
  chatWindowClosed,
  dockChat,
  focusChatWindow,
  getChatWindow,
  popOutChat,
} from "./chatWindow.ts";
import { fadeOutCopy, SLIDE, SLIDE_BACK, useFade } from "./motion.ts";
import { RAISED_BUTTON_CLASS } from "./surfaces.ts";

/**
 * The chat box's stylesheet uses the site's colors. The panel gives the box the game screen's
 * colors where they differ. A color such as "--chat-bg" that refers to another one gets its value
 * on the page's root, so the panel sets it too.
 */
const CHAT_BOX_COLORS = {
  // The messages sit in a dark well, so that the light text stands out from the green.
  "--chat-bg": "var(--game-screen-well)",
  "--focus": "var(--game-screen-line)",
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
  "tw:pb-0",
  // The "is typing" note gets its own row below the chat box, centered in it, so that it does not
  // touch the box and does not resize the chat when it appears. It stays on one line, so that it
  // does not spill out of its row. When the names do not fit, they end with an ellipsis, and the
  // verb stays.
  "tw:[&_#game-chat-istyping]:bottom-0",
  "tw:[&_#game-chat-istyping]:h-[26px]",
  "tw:[&_#game-chat-istyping]:shrink-0",
  "tw:[&_#game-chat-istyping]:leading-[26px]",
  "tw:[&_#game-chat-istyping]:flex",
  "tw:[&_#game-chat-istyping]:whitespace-pre",
  "tw:[&_#game-chat-istyping>span:first-child]:truncate",
  "tw:[&_#game-chat-istyping>span:last-child]:shrink-0",
  // The site's text size changes with the window width, and at its largest it fits only a few words
  // on each line of the narrow panel. The text box sets its own size, so it gets the same size too.
  "tw:text-lg",
  "tw:[&_input]:text-lg",
  // The site's light font weight is hard to read on the green panel. Names stay bolder than the
  // text, as they are on the rest of the site.
  "tw:font-normal",
  "tw:[&_input]:font-normal",
  "tw:[&_strong]:font-semibold",
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

/** The width of the thin rail of the collapsed chat. */
export const CHAT_RAIL_WIDTH = 56;

/** Our own name and our friends' names have their colors, as in the lobby. */
function getSpectatorClassName(
  spectator: string,
  ourUsername: string,
  friends: readonly string[],
): string | undefined {
  if (spectator === ourUsername) {
    return "tw:text-name-me";
  }

  return friends.includes(spectator) ? "tw:text-friend" : undefined;
}

/**
 * The in-game chat, along the right edge of the screen. It shows the same chat box as the classic
 * screen's chat window, which keeps its emoji, commands, typing indicator, and history. When it is
 * collapsed, a thin rail shows the unread messages and the spectators instead. Right-clicking the
 * chat button turns zen mode on or off.
 */
export function ChatPanel({
  open,
  railHidden,
  zen,
  zenAvailable,
  poppedOut,
  overlay,
  unread,
  spectators,
  ourUsername,
  friends,
  spectatorsTooltip,
  reducedMotion,
}: {
  readonly open: boolean;

  /**
   * Whether the collapsed chat has no rail, because its button is in the panel of the right column
   * (see "StatusStrip.tsx").
   */
  readonly railHidden: boolean;

  /**
   * Whether zen mode is on. The chat button then shows a yin-yang, and the screen passes no unread
   * messages and no spectators.
   */
  readonly zen: boolean;

  /**
   * Whether the player can turn zen mode on. A finished game has no players to distract, so zen
   * mode is off, and the tooltips do not offer it (see "zen.ts").
   */
  readonly zenAvailable: boolean;

  /** Whether the chat is in its own window. The panel then stays collapsed. */
  readonly poppedOut: boolean;

  /** Whether the open panel covers the table, on windows too narrow to fit both side by side. */
  readonly overlay: boolean;
  readonly unread: number;

  /** The names of the people watching the game. */
  readonly spectators: readonly string[];

  /** Our own name, which the list of spectators shows in our color, as the tooltip does. */
  readonly ourUsername: string;

  /** Our friends' names, which the list of spectators shows in the friend color. */
  readonly friends: readonly string[];

  /** The tooltip of the spectator count, which lists the people watching, one per line. */
  readonly spectatorsTooltip: string;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const boxRef = useRef<HTMLDivElement>(null);

  // Borrow the chat box from the classic chat window while the panel is open, and give it back when
  // the panel closes, so that the classic screen can show it again.
  useLayoutEffect(() => {
    const container = boxRef.current;
    return !open || poppedOut || container === null
      ? undefined
      : borrowChatBox(container);
  }, [open, poppedOut]);

  // While the chat is popped out, its window borrows the chat box instead.
  useLayoutEffect(() => {
    const chatWindow = getChatWindow();
    if (!poppedOut || chatWindow === undefined) {
      return undefined;
    }

    const giveBack = setUpChatWindow(chatWindow);
    // The player closed the window, or reloaded it.
    chatWindow.addEventListener("pagehide", chatWindowClosed);
    // The window would stay open with nothing in it after we leave or reload the page.
    function closeChatWindow() {
      chatWindow!.close();
    }
    window.addEventListener("pagehide", closeChatWindow);

    return () => {
      chatWindow.removeEventListener("pagehide", chatWindowClosed);
      window.removeEventListener("pagehide", closeChatWindow);
      giveBack();
      // We also get here when we leave the game, and then the chat goes back to the panel too.
      dockChat();
    };
  }, [poppedOut]);

  const spectatorsLabel = `${spectators.length} watching`;

  if (!open || poppedOut) {
    // In the phone layout, the chat button is on the bottom bar instead (see "StatusStrip.tsx"),
    // and the rail is hidden, so that the table gets its width. The same happens when the bar is a
    // panel in the right column. The open panel's header still names the people watching.
    return (
      <aside
        aria-label="Chat, collapsed"
        className={`tw:shrink-0 tw:flex-col tw:items-center tw:gap-2.5 tw:border-l tw:border-game-raised tw:bg-game-panel tw:py-3.5 ${railHidden ? "tw:hidden" : "tw:flex tw:phone:hidden"}`}
        style={{ width: CHAT_RAIL_WIDTH }}
      >
        <ChatButton
          className={`tw:size-11 tw:bg-game-raised tw:text-game-text tw:hover:bg-game-line ${RAISED_BUTTON_CLASS}`}
          open={false}
          poppedOut={poppedOut}
          unread={unread}
          zen={zen}
          zenAvailable={zenAvailable}
        />
        {/* Only a count: the open panel's header names the people watching. */}
        {spectators.length > 0 && (
          <div
            aria-label={spectatorsLabel}
            className="tw:flex tw:flex-col tw:items-center tw:gap-0.5 tw:px-2 tw:py-1 tw:text-[13px] tw:text-game-muted"
            ref={tooltipRefHtml(spectatorsTooltip, { instant: true })}
            role="img"
          >
            <SpectatorsIcon />
            {spectators.length}
          </div>
        )}
      </aside>
    );
  }

  return (
    <OpenChat overlay={overlay} reducedMotion={reducedMotion}>
      <header className="tw:flex tw:items-start tw:gap-2 tw:border-b tw:border-game-zone tw:py-3.5 tw:pr-2 tw:pl-5 tw:text-sm tw:text-game-muted">
        {/* With no one watching, the header stays blank. It names everyone, and wraps when the
            names need more than one line. Its tooltip also says whom each person shadows. */}
        <div
          className="tw:min-w-0 tw:flex-1 tw:leading-relaxed"
          ref={
            spectators.length > 0
              ? tooltipRefHtml(spectatorsTooltip, { instant: true })
              : undefined
          }
        >
          {spectators.length > 0 && (
            <>
              <SpectatorsIcon className="tw:mr-1.5" />
              Watching ({spectators.length}):{" "}
              <span className="tw:text-game-text">
                {spectators.map((spectator, i) => (
                  <Fragment key={spectator}>
                    {i > 0 && ", "}
                    <span
                      className={getSpectatorClassName(
                        spectator,
                        ourUsername,
                        friends,
                      )}
                    >
                      {spectator}
                    </span>
                  </Fragment>
                ))}
              </span>
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
          <i aria-hidden="true" className="fas fa-up-right-from-square" />
        </button>
        <button
          aria-label="Collapse chat"
          className={HEADER_BUTTON_CLASSES}
          onClick={() => {
            gameChat.hide();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            toggleZen();
          }}
          ref={tooltipRef(getZenTooltip("Collapse chat", zen, zenAvailable))}
          type="button"
        >
          <i aria-hidden="true" className="fas fa-angles-right" />
        </button>
      </header>
      <div
        className="tw:min-h-0 tw:flex-1"
        ref={boxRef}
        style={CHAT_BOX_COLORS as React.CSSProperties}
      />
    </OpenChat>
  );
}

/**
 * The open chat. When it covers the table, it slides in from the right edge of the screen, and a
 * copy of it slides back out when it closes (see `fadeOutCopy`). Beside the table, it opens and
 * closes at once, since the cards change size to make room for it.
 */
function OpenChat({
  overlay,
  reducedMotion,
  children,
}: {
  readonly overlay: boolean;
  readonly reducedMotion: boolean;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const asideRef = useRef<HTMLElement>(null);

  // A chat that starts or stops covering the table while it is open, such as when the window
  // changes size, does not slide. Only opening and closing it does.
  const slidesRef = useRef(false);
  useLayoutEffect(() => {
    slidesRef.current = overlay && !reducedMotion;
  }, [overlay, reducedMotion]);

  useLayoutEffect(() => {
    const aside = asideRef.current;
    if (aside === null) {
      return undefined;
    }
    const outside = { transform: "translateX(100%)" };
    if (slidesRef.current) {
      aside.animate([outside, { transform: "none" }], SLIDE);
    }

    // The chat is still on the page when the cleanup runs: React removes it after that.
    return () => {
      if (slidesRef.current) {
        fadeOutCopy(
          aside,
          [{ transform: getComputedStyle(aside).transform }, outside],
          SLIDE_BACK,
        );
      }
    };
  }, []);

  return (
    <aside
      aria-label="Chat"
      className={`tw:flex tw:w-[320px] tw:max-w-full tw:shrink-0 tw:flex-col tw:border-l tw:border-game-raised tw:bg-game-panel ${
        overlay
          ? "tw:absolute tw:inset-y-0 tw:right-0 tw:z-20 tw:shadow-2xl"
          : ""
      }`}
      ref={asideRef}
    >
      {children}
    </aside>
  );
}

/**
 * The button that opens the chat, or shows the chat window when the chat is popped out. While the
 * chat panel is open, it collapses the chat. It shows how many messages are unread. A right-click
 * turns zen mode on or off.
 */
export function ChatButton({
  zen,
  zenAvailable,
  open,
  poppedOut,
  unread,
  className,
  pressedClassName,
}: {
  readonly zen: boolean;

  /** Whether the player can turn zen mode on (see `ChatPanel`). */
  readonly zenAvailable: boolean;

  /** Whether the chat panel is open. */
  readonly open: boolean;
  readonly poppedOut: boolean;
  readonly unread: number;

  /** The button's size and colors. */
  readonly className: string;

  /**
   * The color that lights the button while it collapses the chat, as a pressed toggle, such as
   * `tw:bg-game-text`. It fades in and out (see `FadeLayer`).
   */
  readonly pressedClassName?: string;
}): React.JSX.Element {
  const collapses = open && !poppedOut;
  const reducedMotion = useReducedMotion();
  let action = "Open chat";
  if (poppedOut) {
    action = "Show chat window";
  } else if (collapses) {
    action = "Collapse chat";
  }
  let label = action;
  if (zen) {
    label = `${action}, in zen mode`;
  } else if (!poppedOut && !collapses && unread > 0) {
    label = `Open chat, ${unread} unread messages`;
  }
  const tooltip = getZenTooltip(action, zen, zenAvailable);
  let icon = "fa-comment";
  if (zen) {
    icon = "fa-yin-yang";
  } else if (poppedOut) {
    icon = "fa-up-right-from-square";
  }

  return (
    <button
      aria-label={label}
      aria-pressed={collapses ? true : undefined}
      className={`tw:flex tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-game-control tw:border-0 ${FADE_LAYER_PARENT_CLASS} ${className}`}
      onClick={() => {
        if (poppedOut) {
          focusChatWindow(true);
        } else if (collapses) {
          gameChat.hide();
        } else {
          gameChat.show();
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        toggleZen();
      }}
      ref={tooltipRef(tooltip)}
      style={getButtonTextColorStyle(collapses, reducedMotion)}
      type="button"
    >
      {pressedClassName !== undefined && (
        <FadeLayer
          className={pressedClassName}
          reducedMotion={reducedMotion}
          shown={collapses}
        />
      )}
      <i aria-hidden="true" className={`fas ${icon}`} />
      {unread > 0 && !collapses && (
        <UnreadBadge reducedMotion={reducedMotion} unread={unread} />
      )}
    </button>
  );
}

/** The count of unread messages on the chat button. It fades in and out. */
function UnreadBadge({
  unread,
  reducedMotion,
}: {
  readonly unread: number;
  readonly reducedMotion: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLSpanElement>(null);
  useFade(ref, reducedMotion);
  return (
    <span
      className="tw:absolute tw:-top-1 tw:-right-1 tw:flex tw:h-5 tw:min-w-5 tw:items-center tw:justify-center tw:rounded-full tw:bg-clue tw:px-1.5 tw:text-xs tw:font-bold tw:text-card-ink"
      ref={ref}
    >
      {unread}
    </span>
  );
}

/**
 * The tooltip of a button that opens or collapses the chat. A right-click turns zen mode on or off,
 * but only in a game that is not finished.
 */
function getZenTooltip(
  action: string,
  zen: boolean,
  zenAvailable: boolean,
): string {
  if (zen) {
    return `Zen mode hides the chat and who is watching. Click to ${action.toLowerCase()}. Right-click to leave zen mode.`;
  }
  return zenAvailable
    ? `${action}. Right-click for zen mode, which hides the chat and who is watching.`
    : action;
}
