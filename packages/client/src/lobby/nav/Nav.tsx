// The navigation bar at the top of the lobby. Its buttons depend on the screen.

import { Children } from "react";
import { PATH } from "../../constants.ts";
import { globals } from "../../Globals.ts";
import type { RootState } from "../../store.ts";
import { useAppSelector } from "../../store.ts";
import { tooltipRef } from "../../tooltipRef.ts";
import * as createGame from "../createGame.ts";
import { ShownGameCount } from "../gameHistory/HistoryLists.tsx";
import * as history from "../history.ts";
import * as lobbyPage from "../lobbyPage.ts";
import { signOut } from "../signOut.ts";
import { Screen } from "../types/Screen.ts";
import * as watchReplay from "../watchReplay/WatchReplay.tsx";
import {
  joinGame,
  leaveGame,
  returnToLobby,
  selectCanStartGame,
  selectJoinButton,
  spectateGame,
  startGame,
} from "./navActions.ts";

const LIST_ITEM_CLASS_NAME = "tw:inline-block tw:pl-0";

const BUTTON_CLASS_NAME = [
  "button tw:relative tw:ml-2 tw:inline-block tw:h-[2em] tw:rounded-(--radius) tw:px-4",
  "tw:leading-[2em] tw:[box-shadow:inset_0_0_0_2px_var(--header-button-border)]",
  "tw:narrow-1280:px-2",
].join(" ");

/** A disabled button takes its colors from the ".disabled" rule instead. */
const ENABLED_COLOR_CLASS_NAME =
  "tw:bg-transparent tw:hover:bg-(--header-button-hover-bg) tw:active:bg-(--header-button-active-bg)";

const HELP_COLOR_CLASS_NAME =
  "tw:bg-(--button-green) tw:hover:bg-(--button-green-hover)";

const ICON_CLASS_NAME =
  "tw:relative tw:top-[0.05em] tw:mr-[0.3em] tw:narrow-840:mr-0";

type NavBar = "lobby" | "pregame" | "page" | "history" | "otherScores";

function selectNavBar(state: RootState): NavBar | undefined {
  if (state.session.errorOccurred) {
    return undefined;
  }

  if (state.session.lobbyPage !== undefined) {
    return "page";
  }

  switch (state.session.screen) {
    case Screen.Lobby: {
      return "lobby";
    }

    case Screen.PreGame: {
      return "pregame";
    }

    case Screen.History: {
      return "history";
    }

    case Screen.HistoryOtherScores: {
      return "otherScores";
    }

    case Screen.Login:
    case Screen.Game: {
      return undefined;
    }
  }
}

export function Nav(): React.JSX.Element | undefined {
  const navBar = useAppSelector(selectNavBar);

  switch (navBar) {
    case "lobby": {
      return <LobbyNav />;
    }

    case "pregame": {
      return <PregameNav />;
    }

    case "page": {
      return <PageNav />;
    }

    case "history": {
      return <HistoryNav />;
    }

    case "otherScores": {
      return <OtherScoresNav />;
    }

    case undefined: {
      return undefined;
    }
  }
}

function LobbyNav() {
  const creatingTable = useAppSelector((state) => state.session.creatingTable);

  return (
    <NavList>
      <NavButton
        disabled={creatingTable}
        icon="fa-plus"
        id="nav-buttons-lobby-create-game"
        onClick={createGame.show}
      >
        <span className="tw:narrow-530:hidden">
          <Hotkey>N</Hotkey>ew
          <span className="tw:narrow-1280:hidden"> Game</span>
        </span>
      </NavButton>
      <NavButton
        className="tw:narrow-530:hidden"
        icon="fa-history"
        id="nav-buttons-lobby-history"
        onClick={() => {
          history.show();
        }}
      >
        <span className="tw:narrow-530:hidden">
          <Hotkey>H</Hotkey>istory
        </span>
      </NavButton>
      <NavButton
        icon="fa-eye"
        id="nav-buttons-lobby-replay"
        onClick={watchReplay.show}
      >
        <span className="tw:narrow-530:hidden">
          <span className="tw:narrow-1280:hidden">Watch </span>Repl
          <Hotkey>a</Hotkey>y
        </span>
      </NavButton>
      <NavButton
        className="tw:narrow-640:hidden"
        icon="fa-link"
        id="nav-buttons-lobby-resources"
        onClick={() => {
          lobbyPage.show("resources");
        }}
      >
        <span className="tw:narrow-840:hidden">Resources</span>
      </NavButton>
      <NavButton
        icon="fa-cog"
        id="nav-buttons-lobby-settings"
        onClick={() => {
          lobbyPage.show("settings");
        }}
      >
        <span className="tw:narrow-840:hidden">Settings</span>
      </NavButton>
      <li className={LIST_ITEM_CLASS_NAME}>
        <a
          className={`${BUTTON_CLASS_NAME} ${HELP_COLOR_CLASS_NAME} tw:narrow-530:hidden`}
          href="https://github.com/Hanabi-Live/hanabi-live/blob/main/docs/features.md"
          id="nav-buttons-lobby-help"
          rel="noopener noreferrer"
          target="_blank"
        >
          <i className={`fas fa-question-circle ${ICON_CLASS_NAME}`} />{" "}
          <span className="tw:narrow-840:hidden">Help</span>
        </a>
      </li>
      <NavButton
        icon="fa-sign-out-alt"
        id="nav-buttons-lobby-sign-out"
        onClick={signOut}
      >
        <span className="tw:narrow-840:hidden">
          Sign <Hotkey>O</Hotkey>ut
        </span>
      </NavButton>
    </NavList>
  );
}

function PregameNav() {
  const canStart = useAppSelector(selectCanStartGame);
  const joinButton = useAppSelector(selectJoinButton);

  return (
    <NavList>
      <NavButton
        disabled={!canStart}
        icon="fa-play"
        id="nav-buttons-pregame-start"
        onClick={startGame}
      >
        <span className="tw:narrow-530:hidden">
          <Hotkey>S</Hotkey>tart
          <span className="tw:narrow-840:hidden"> Game</span>
        </span>
      </NavButton>
      {joinButton.type === "join" ? (
        <NavButton
          disabled={!joinButton.enabled}
          icon="fa-sign-in-alt"
          id="nav-buttons-pregame-join"
          onClick={joinGame}
        >
          <span className="tw:narrow-530:hidden">
            <Hotkey>J</Hotkey>oin
            <span className="tw:narrow-840:hidden"> Game</span>
          </span>
        </NavButton>
      ) : (
        <NavButton
          disabled={!joinButton.enabled}
          icon="fa-glasses"
          id="nav-buttons-pregame-spectate"
          onClick={spectateGame}
        >
          <span className="tw:narrow-530:hidden">
            S<Hotkey>p</Hotkey>ectate
            <span className="tw:narrow-840:hidden"> Game</span>
          </span>
        </NavButton>
      )}
      <NavButton
        icon="fa-rainbow"
        id="nav-buttons-pregame-change-options"
        onClick={createGame.show}
      >
        <span className="tw:narrow-840:hidden">
          <Hotkey>C</Hotkey>hange Options
        </span>
      </NavButton>
      <NavButton
        icon="fa-pause"
        id="nav-buttons-pregame-unattend"
        onClick={returnToLobby}
      >
        <span className="tw:narrow-530:hidden">
          <span className="tw:narrow-840:hidden">
            <Hotkey>R</Hotkey>eturn to{" "}
          </span>
          Lobby
        </span>
      </NavButton>
      <NavButton
        icon="fa-times"
        id="nav-buttons-pregame-leave"
        onClick={leaveGame}
      >
        <span className="tw:narrow-530:hidden">
          <Hotkey>L</Hotkey>eave
          <span className="tw:narrow-840:hidden"> Game</span>
        </span>
      </NavButton>
    </NavList>
  );
}

function PageNav() {
  // A page from the pre-game screen returns to it.
  const target = useAppSelector((state) =>
    state.session.screen === Screen.PreGame ? "Game" : "Lobby",
  );

  return (
    <NavList>
      <NavButton
        icon="fa-arrow-left"
        id="nav-buttons-page-return"
        onClick={lobbyPage.hide}
      >
        <span className="tw:narrow-736:hidden">
          <Hotkey>R</Hotkey>eturn to {target}
        </span>
      </NavButton>
    </NavList>
  );
}

function HistoryNav() {
  return (
    <NavList>
      <li className={`${LIST_ITEM_CLASS_NAME} tw:mr-[0.375em]`}>
        Shown games: <ShownGameCount /> / <TotalGames />
      </li>
      <NavButton
        icon="fa-arrow-left"
        id="nav-buttons-history-return"
        onClick={history.hide}
      >
        <span className="tw:narrow-736:hidden">
          <Hotkey>R</Hotkey>eturn to Lobby
        </span>
      </NavButton>
    </NavList>
  );
}

function TotalGames() {
  const totalGames = useAppSelector((state) => state.history.totalGames);
  const failed = useAppSelector((state) => state.history.totalGamesFailed);

  if (totalGames !== undefined) {
    return <>{totalGames}</>;
  }

  if (!failed) {
    return <>loading...</>;
  }

  return (
    <span
      className="tw:cursor-pointer"
      onClick={() => {
        globals.conn?.send("lobbyLoad", {});
      }}
      ref={tooltipRef("Loading lobby statistics failed.")}
    >
      unavailable (click to retry)
    </span>
  );
}

function OtherScoresNav() {
  const seed = useAppSelector((state) => state.history.otherScores?.seed);

  return (
    <NavList>
      <li className={LIST_ITEM_CLASS_NAME}>
        <a
          className={`${BUTTON_CLASS_NAME} ${ENABLED_COLOR_CLASS_NAME}`}
          href={seed === undefined ? PATH.SEED : `${PATH.SEED}/${seed}`}
          id="nav-buttons-history-other-scores-view-all"
          rel="noopener noreferrer"
          target="_blank"
        >
          <i className={`fas fa-search-plus ${ICON_CLASS_NAME}`} /> View seed
          data
        </a>
      </li>
      <NavButton
        icon="fa-arrow-left"
        id="nav-buttons-history-other-scores-return"
        onClick={history.hideOtherScores}
      >
        <Hotkey>R</Hotkey>eturn to History
      </NavButton>
    </NavList>
  );
}

/** A space separates the items, which are inline blocks, as in the classic markup. */
function NavList({ children }: { readonly children: React.ReactNode }) {
  const items = Children.toArray(children);
  return (
    <ul className="tw:m-0 tw:list-none tw:pl-0">
      {items.flatMap((item, i) => (i === 0 ? [item] : [" ", item]))}
    </ul>
  );
}

function NavButton({
  children,
  className,
  disabled = false,
  icon,
  id,
  onClick,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly icon: string;
  readonly id: string;
  readonly onClick: () => void;
}) {
  const colorClassName = disabled ? "disabled" : ENABLED_COLOR_CLASS_NAME;
  return (
    <li className={LIST_ITEM_CLASS_NAME}>
      <a
        className={[BUTTON_CLASS_NAME, colorClassName, className]
          .join(" ")
          .trim()}
        id={id}
        onClick={() => {
          if (!disabled) {
            onClick();
          }
        }}
      >
        <i className={`fas ${icon} ${ICON_CLASS_NAME}`} /> {children}
      </a>
    </li>
  );
}

/** The letter of a keyboard shortcut. */
function Hotkey({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="tw:[border-bottom:1px_solid_var(--header-button-border)]">
      {children}
    </span>
  );
}
