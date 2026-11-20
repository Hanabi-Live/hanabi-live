// The lobby: the tables (or the table that we are at) above the chats and the online users. A lobby
// page or a history screen replaces both halves. On small screens, buttons at the bottom switch
// between the halves.

import { useEffect } from "react";
import { useReducedMotion } from "../fade.ts";
import {
  FADE_LAYER_PARENT_CLASS,
  FadeLayer,
} from "../game/newUi/FadeLayer.tsx";
import { lobbyPanelChanged } from "../sessionSlice.ts";
import type { RootState } from "../store.ts";
import { store, useAppSelector } from "../store.ts";
import { getHtmlInputElement } from "../utils.ts";
import { LobbyChat, scrollLobbyChatToBottom } from "./chat/LobbyChat.tsx";
import { HistoryList, OtherScoresList } from "./gameHistory/HistoryLists.tsx";
import { LobbyPages } from "./LobbyPages.tsx";
import { Pregame } from "./pregame/Pregame.tsx";
import { PREGAME_CHAT_INPUT_ID, PregameChat } from "./pregame/PregameChat.tsx";
import { TablesList } from "./tables/TablesList.tsx";
import type { LobbyPanel } from "./types/LobbyPanel.ts";
import { Screen } from "./types/Screen.ts";
import { UsersList, UsersTitle } from "./users/UsersList.tsx";
import { selectUserCount } from "./users/usersSlice.ts";

/**
 * The classes of "#lobby", which the component renders into. The lobby fills the page below the
 * header, and its rows share the height. Tailwind's utilities beat the "hidden" class, so the lobby
 * is a flex box only while it is shown.
 */
export const LOBBY_CLASS_NAME =
  "tw:not-[.hidden]:flex tw:h-full tw:flex-col tw:pt-5 tw:pb-6 tw:compact:pb-3";

/** A row that takes its share of the height of the lobby. */
const HALF = "tw:min-h-0 tw:flex-1";

/**
 * The top half while it shows the table that we are at: only as tall as the table, up to half of
 * the lobby, so that the chats below get the rest. Small screens show one half at a time, so there
 * it fills the lobby. The column and the box inside pass the height on, so that the seats scroll
 * when they do not fit.
 */
const PREGAME_HALF =
  "tw:min-h-0 tw:flex-initial tw:flex-col tw:flex-nowrap tw:max-h-[calc((100%---spacing(6))/2)] tw:compact:max-h-none tw:compact:flex-1";
const PREGAME_COLUMN = "tw:flex tw:min-h-0 tw:flex-auto tw:flex-col";

/** A box that fills its column. */
const SECTION = "box tw:mb-0 tw:h-full tw:p-6";

/** A box whose list or chat fills the height below its title. */
const CHAT_SECTION = `${SECTION} tw:flex tw:flex-col`;

/**
 * The columns of the bottom half while small screens show the pre-game chat: side by side on short
 * screens, and above each other on narrow ones.
 */
const PREGAME_CHAT_LAYOUT =
  "tw:short-530:flex-[1_1_33%] tw:short-530:h-full tw:narrow-530:h-[calc((100%-1em)/2)] tw:narrow-530:flex-[1_1_100%]";

/** Joins the class names that apply. */
function classes(...names: ReadonlyArray<string | false>): string {
  return names.filter(Boolean).join(" ");
}

/** Whether a lobby page or a history screen replaces the halves of the lobby. */
function selectFullScreen(state: RootState): boolean {
  return (
    state.session.lobbyPage !== undefined
    || state.session.screen === Screen.History
    || state.session.screen === Screen.HistoryOtherScores
  );
}

export function Lobby(): React.JSX.Element {
  const screen = useAppSelector((state) => state.session.screen);
  const panel = useAppSelector((state) => state.session.lobbyPanel);
  const full = useAppSelector(selectFullScreen);
  const userCount = useAppSelector(selectUserCount);
  const inPregame = screen === Screen.PreGame;

  // The pre-game chat takes room from the lobby chat, which keeps it scrolled to the bottom.
  // Joining a table moves the focus to its chat, and leaving it takes the focus away, since the
  // hidden chat would still receive what the player types.
  useEffect(() => {
    scrollLobbyChatToBottom();
    const input = getHtmlInputElement(`#${PREGAME_CHAT_INPUT_ID}`);
    if (inPregame) {
      input.focus();
    } else if (document.activeElement === input) {
      input.blur();
    }
  }, [inPregame]);

  // The halves stay rendered while they are hidden, so that the chats keep what was typed. Small
  // screens show one half at a time.
  return (
    <>
      <div
        className={classes(
          "row",
          inPregame ? PREGAME_HALF : HALF,
          panel !== "tables" && "tw:compact:hidden",
          full && "tw:hidden",
        )}
        id="lobby-top-half"
      >
        <div
          className={classes(
            "col-12",
            inPregame ? PREGAME_COLUMN : "tw:h-full",
          )}
        >
          <section
            className={classes(SECTION, inPregame && "tw:hidden")}
            id="lobby-games"
          >
            <TablesList />
          </section>
          <section
            className={classes(
              "box tw:mb-0 tw:p-6",
              inPregame ? PREGAME_COLUMN : "tw:hidden",
            )}
            id="lobby-pregame"
          >
            <Pregame />
          </section>
        </div>
      </div>

      <div
        className={classes(
          "row tw:h-6 tw:flex-none tw:compact:hidden",
          full && "tw:hidden",
        )}
        id="lobby-separator"
      />

      <div
        className={classes(
          "row",
          HALF,
          panel === "tables" && "tw:compact:hidden",
          full && "tw:hidden",
        )}
        id="lobby-bottom-half"
      >
        <div
          className={classes(
            inPregame ? "col-4" : "col-8",
            "tw:h-full tw:narrow-640:w-full",
            panel === "online" && "tw:narrow-640:hidden",
            panel === "gameChat" && `${PREGAME_CHAT_LAYOUT} tw:compact:mb-4`,
          )}
          id="lobby-chat-container"
        >
          <section className={CHAT_SECTION} id="lobby-chat">
            <LobbyChat />
          </section>
        </div>

        <div
          className={classes(
            "col-4 tw:h-full tw:pl-6 tw:narrow-530:ml-2",
            !inPregame && "tw:hidden",
            panel === "online" && "tw:narrow-640:hidden",
            panel === "gameChat" && PREGAME_CHAT_LAYOUT,
          )}
          id="lobby-chat-pregame-container"
        >
          <section className={CHAT_SECTION} id="lobby-chat-pregame">
            <PregameChat />
          </section>
        </div>

        <div
          className={classes(
            "col-4 tw:h-full tw:pl-6 tw:narrow-640:w-full tw:narrow-640:pl-8",
            (panel === "chat" || panel === "gameChat")
              && "tw:narrow-640:hidden",
            panel === "gameChat" && PREGAME_CHAT_LAYOUT,
          )}
          id="lobby-online-users"
        >
          <section className={CHAT_SECTION}>
            <h3 className="tw:text-[1.3em]" id="lobby-users-title">
              <UsersTitle />
            </h3>
            <div
              className="tw:min-h-0 tw:flex-1 tw:overflow-y-auto"
              id="lobby-users-container"
            >
              <UsersList />
            </div>
          </section>
        </div>
      </div>

      <nav
        aria-label="Lobby panels"
        className={
          full
            ? "tw:hidden"
            : "tw:mt-4 tw:hidden tw:gap-1 tw:rounded-[calc(var(--radius)+4px)] tw:border tw:border-(--box-line) tw:bg-(--box-sunken) tw:p-1 tw:compact:flex"
        }
        id="lobby-small-screen-buttons"
        role="tablist"
      >
        <PanelButton
          icon={inPregame ? "fa-users-rectangle" : "fa-table-cells-large"}
          id="tables"
          panel="tables"
          shown
        >
          {inPregame ? "Game" : "Tables"}
        </PanelButton>
        {/* Short, wide screens show the online users beside the chat. */}
        <PanelButton
          className="tw:short-530-wide:hidden"
          count={userCount}
          icon="fa-user-group"
          id="online"
          panel="online"
          shown
        >
          Online
        </PanelButton>
        <PanelButton
          icon="fa-comments"
          id="chat"
          panel="chat"
          shown={!inPregame}
        >
          Chat
        </PanelButton>
        <PanelButton
          icon="fa-comments"
          id="game-chat"
          panel="gameChat"
          shown={inPregame}
        >
          Chats
        </PanelButton>
      </nav>

      <div
        className={classes("row", HALF, !full && "tw:hidden")}
        id="lobby-full"
      >
        <div className="col-12 tw:h-full">
          <section
            className={classes(
              SECTION,
              screen !== Screen.History && "tw:hidden",
            )}
            id="lobby-history"
          >
            <HistoryList />
          </section>
          <div className="tw:contents" id="lobby-pages">
            <LobbyPages />
          </div>
          <section
            className={classes(
              SECTION,
              screen !== Screen.HistoryOtherScores && "tw:hidden",
            )}
            id="lobby-history-other-scores"
          >
            <OtherScoresList />
          </section>
        </div>
      </div>
    </>
  );
}

/**
 * A tab that switches between the halves of the lobby on small screens. The tabs share the width of
 * the bar. The selected tab is a raised green key, which fades in, so that the eye follows the
 * switch.
 */
function PanelButton({
  children,
  className,
  count,
  icon,
  id,
  panel,
  shown,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly count?: number;
  readonly icon: string;
  readonly id: string;
  readonly panel: LobbyPanel;
  readonly shown: boolean;
}) {
  const active = useAppSelector((state) => state.session.lobbyPanel === panel);
  const reducedMotion = useReducedMotion();
  return (
    <button
      aria-selected={active}
      className={classes(
        FADE_LAYER_PARENT_CLASS,
        "tw:flex tw:min-h-11 tw:min-w-0 tw:flex-1 tw:cursor-pointer tw:flex-wrap tw:items-center tw:justify-center tw:gap-x-2 tw:gap-y-1 tw:rounded-(--radius) tw:border-0 tw:bg-transparent tw:px-2 tw:font-[inherit] tw:text-[0.95em] tw:leading-none tw:whitespace-nowrap",
        // Narrow phones put the icon above the label, so that each label fits its third of the bar.
        "tw:narrow-410:gap-x-1 tw:narrow-410:py-1.5 tw:narrow-410:text-[0.85em]",
        "tw:transition-[color,translate] tw:duration-150 tw:active:translate-y-px",
        active
          ? "tw:text-text-on-accent"
          : "tw:text-text-label tw:hover:text-text",
        className ?? false,
        !shown && "tw:hidden",
      )}
      id={`lobby-toggle-show-${id}`}
      onClick={() => {
        store.dispatch(lobbyPanelChanged(panel));
      }}
      role="tab"
      type="button"
    >
      <FadeLayer
        className="tw:bg-green tw:shadow-(--button-key-shadow)"
        reducedMotion={reducedMotion}
        shown={active}
      />
      {!active && (
        <span
          aria-hidden="true"
          className="tw:pointer-events-none tw:absolute tw:inset-0 tw:-z-10 tw:rounded-[inherit] tw:bg-button-translucent tw:opacity-0 tw:transition-opacity tw:group-hover/layer:opacity-100"
        />
      )}
      <i
        aria-hidden="true"
        className={`fas ${icon} tw:text-[1.05em] tw:narrow-410:basis-full tw:narrow-410:text-[1.2em]`}
      />
      <span className="tw:truncate">{children}</span>
      {count !== undefined && (
        <span
          className={classes(
            "tw:rounded-full tw:px-[0.5em] tw:py-[0.2em] tw:text-[0.8em] tw:tabular-nums",
            active ? "tw:bg-black/25" : "tw:bg-button-translucent",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
