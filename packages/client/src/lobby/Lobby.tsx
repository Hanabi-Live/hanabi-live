// The lobby: the tables (or the table that we are at) above the chats and the online users. A lobby
// page or a history screen replaces both halves. On small screens, buttons at the bottom switch
// between the halves.

import { useEffect } from "react";
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

/**
 * The classes of "#lobby", which the component renders into. The lobby fills the page below the
 * header, and its rows share the height. Tailwind's utilities beat the "hidden" class, so the lobby
 * is a flex box only while it is shown.
 */
export const LOBBY_CLASS_NAME =
  "tw:not-[.hidden]:flex tw:h-full tw:flex-col tw:pt-5 tw:pb-6 tw:compact:pb-3";

/** A row that takes its share of the height of the lobby. */
const HALF = "tw:min-h-0 tw:flex-1";

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
  const inPregame = screen === Screen.PreGame;

  // The pre-game chat takes room from the lobby chat, which keeps it scrolled to the bottom.
  // Joining a table moves the focus to its chat.
  useEffect(() => {
    scrollLobbyChatToBottom();
    if (inPregame) {
      getHtmlInputElement(`#${PREGAME_CHAT_INPUT_ID}`).focus();
    }
  }, [inPregame]);

  // The halves stay rendered while they are hidden, so that the chats keep what was typed. Small
  // screens show one half at a time.
  return (
    <>
      <div
        className={classes(
          "row",
          HALF,
          panel !== "tables" && "tw:compact:hidden",
          full && "tw:hidden",
        )}
        id="lobby-top-half"
      >
        <div className="col-12 tw:h-full">
          <section
            className={classes(SECTION, inPregame && "tw:hidden")}
            id="lobby-games"
          >
            <TablesList />
          </section>
          <section
            className={classes(SECTION, !inPregame && "tw:hidden")}
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

      <div
        className={
          full ? "tw:hidden" : "tw:mt-4 tw:hidden tw:h-[2em] tw:compact:block"
        }
        id="lobby-small-screen-buttons"
      >
        <nav id="nav-bottom">
          <ul className="tw:m-0 tw:block tw:list-none tw:pl-0">
            <li className="tw:pl-0">
              <PanelButton id="tables" panel="tables" shown>
                {inPregame ? "Game" : "Tables"}
              </PanelButton>{" "}
              {/* Short, wide screens show the online users beside the chat. */}
              <PanelButton
                className="tw:short-530-wide:hidden"
                id="online"
                panel="online"
                shown
              >
                Who&apos;s Online
              </PanelButton>{" "}
              <PanelButton id="chat" panel="chat" shown={!inPregame}>
                Chat
              </PanelButton>{" "}
              <PanelButton id="game-chat" panel="gameChat" shown={inPregame}>
                Pre-game Chat
              </PanelButton>
            </li>
          </ul>
        </nav>
      </div>

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

/** A button that switches between the halves of the lobby on small screens. */
function PanelButton({
  children,
  className,
  id,
  panel,
  shown,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly id: string;
  readonly panel: LobbyPanel;
  readonly shown: boolean;
}) {
  const active = useAppSelector((state) => state.session.lobbyPanel === panel);
  return (
    <a
      className={classes(
        "button small",
        className ?? false,
        active && "tw:bg-(--button-green)",
        !shown && "tw:hidden",
      )}
      id={`lobby-toggle-show-${id}`}
      onClick={() => {
        store.dispatch(lobbyPanelChanged(panel));
      }}
    >
      {children}
    </a>
  );
}
