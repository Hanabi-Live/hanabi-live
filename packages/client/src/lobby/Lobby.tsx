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

  // The halves stay rendered while they are hidden, so that the chats keep what was typed.
  return (
    <>
      <div
        className={classes(
          "row lobby-half",
          panel === "tables" && "toggle-active",
          full && "hidden",
        )}
        id="lobby-top-half"
      >
        <div className="col-12">
          <section
            className={classes("box", inPregame && "hidden")}
            id="lobby-games"
          >
            <TablesList />
          </section>
          <section
            className={classes("box", !inPregame && "hidden")}
            id="lobby-pregame"
          >
            <Pregame />
          </section>
        </div>
      </div>

      <div className={classes("row", full && "hidden")} id="lobby-separator" />

      <div
        className={classes(
          "row lobby-half",
          panel !== "tables" && "toggle-active",
          full && "hidden",
        )}
        id="lobby-bottom-half"
      >
        <div
          className={classes(
            inPregame ? "col-4" : "col-8",
            panel === "online" && "hidden-640",
            panel === "gameChat" && "pregame-chat-layout pregame-lobby-chat",
          )}
          id="lobby-chat-container"
        >
          <section className="box" id="lobby-chat">
            <LobbyChat />
          </section>
        </div>

        <div
          className={classes(
            "col-4",
            !inPregame && "hidden",
            panel === "online" && "hidden-640",
            panel === "gameChat" && "pregame-chat-layout",
          )}
          id="lobby-chat-pregame-container"
        >
          <section className="box" id="lobby-chat-pregame">
            <PregameChat />
          </section>
        </div>

        <div
          className={classes(
            "col-4 lobby-users-box-container narrow-screen-toggle",
            (panel === "chat" || panel === "gameChat") && "hidden-640",
            panel === "gameChat" && "pregame-chat-layout",
          )}
          id="lobby-online-users"
        >
          <section className="box">
            <h3 className="lobby-title" id="lobby-users-title">
              <UsersTitle />
            </h3>
            <div id="lobby-users-container">
              <UsersList />
            </div>
          </section>
        </div>
      </div>

      <div
        className={classes(full && "hidden")}
        id="lobby-small-screen-buttons"
      >
        <nav id="nav-bottom">
          <ul>
            <li>
              <PanelButton id="tables" panel="tables" shown>
                {inPregame ? "Game" : "Tables"}
              </PanelButton>{" "}
              <PanelButton id="online" panel="online" shown>
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

      <div className={classes("row", !full && "hidden")} id="lobby-full">
        <div className="col-12">
          <section
            className={classes("box", screen !== Screen.History && "hidden")}
            id="lobby-history"
          >
            <HistoryList />
          </section>
          <div id="lobby-pages">
            <LobbyPages />
          </div>
          <section
            className={classes(
              "box",
              screen !== Screen.HistoryOtherScores && "hidden",
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
  id,
  panel,
  shown,
}: {
  readonly children: React.ReactNode;
  readonly id: string;
  readonly panel: LobbyPanel;
  readonly shown: boolean;
}) {
  const active = useAppSelector((state) => state.session.lobbyPanel === panel);
  return (
    <a
      className={classes(
        "button small",
        active && "toggle-active",
        !shown && "hidden",
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
