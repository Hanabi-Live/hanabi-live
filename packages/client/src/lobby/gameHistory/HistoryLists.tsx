// The lobby's screens that show our past games and the other games on a seed. They show the same
// list as a player's history page and a seed's page, and load it again each time they open.

import { API_PREFIX } from "@hanabi-live/data";
import { PATH } from "../../constants.ts";
import { globals } from "../../Globals.ts";
import type { GameActions } from "../../publicPages/GamesTable.tsx";
import { GamesTable } from "../../publicPages/GamesTable.tsx";
import { useAppSelector } from "../../store.ts";
import { hide, showOtherScoresFromHistory } from "../history.ts";
import { replayVisibility } from "../replayVisibility.ts";
import { Screen } from "../types/Screen.ts";

/** The lobby opens a replay through its connection, so that the site does not load again. */
const LOBBY_ACTIONS = {
  watchReplay,
  showOtherGames: showOtherScoresFromHistory,
} as const satisfies GameActions;

const HEADING = "tw:m-0 tw:text-[1.75em] tw:leading-tight";

export function HistoryList(): React.JSX.Element | null {
  const shown = useAppSelector(
    (state) => state.session.screen === Screen.History,
  );
  const username = useAppSelector((state) => state.session.username);
  if (!shown || username === "") {
    return null;
  }

  return (
    <ScreenFrame>
      <div className="tw:flex tw:flex-wrap tw:items-baseline tw:justify-between tw:gap-x-6 tw:gap-y-2">
        <h2 className={HEADING}>Your games</h2>
        <a
          href={`${PATH.HISTORY}/${encodeURIComponent(username)}`}
          id="lobby-history-show-all"
          rel="noopener noreferrer"
          target="_blank"
        >
          Open on its own page
        </a>
      </div>
      <GamesTable
        actions={LOBBY_ACTIONS}
        table={{
          type: "games",
          list: "history",
          apiPath: `${API_PREFIX}/history/${encodeURIComponent(username)}`,
          frequencies: [],
          players: [username],
        }}
      />
    </ScreenFrame>
  );
}

export function OtherScoresList(): React.JSX.Element | null {
  const shown = useAppSelector(
    (state) => state.session.screen === Screen.HistoryOtherScores,
  );
  const seed = useAppSelector((state) => state.history.otherScoresSeed);
  if (!shown || seed === undefined) {
    return null;
  }

  return (
    <ScreenFrame>
      <h2 className={HEADING}>Games on this seed</h2>
      <div className="tw:text-[0.9em] tw:text-text-label">{seed}</div>
      <GamesTable
        actions={LOBBY_ACTIONS}
        key={seed}
        table={{
          type: "games",
          list: "seed",
          apiPath: `${API_PREFIX}/seed/${encodeURIComponent(seed)}`,
          frequencies: [],
        }}
      />
    </ScreenFrame>
  );
}

/** A screen of the lobby that scrolls, with its content as wide as a public page's. */
function ScreenFrame({
  children,
}: {
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="tw:h-full tw:overflow-y-auto">
      <div className="tw:mx-auto tw:max-w-[64em] tw:pb-4">{children}</div>
    </div>
  );
}

/** Opens the replay of a game. We leave the history to watch a shared replay with others. */
function watchReplay(gameId: number, shared: boolean) {
  globals.connection.send("replayCreate", {
    source: {
      type: "saved",
      gameId,
    },
    visibility: replayVisibility(shared),
  });
  if (shared) {
    hide();
  }
}
