// Shows the lobby page that the store names, in place of the lobby. A page starts again each time
// that it shows.

import { useAppSelector } from "../store.ts";
import { CreateGame } from "./createGame/CreateGame.tsx";
import { Resources } from "./resources/Resources.tsx";
import { SettingsPage } from "./settings/SettingsPage.tsx";
import type { LobbyPage } from "./types/LobbyPage.ts";
import { WatchReplay } from "./watchReplay/WatchReplay.tsx";

/** The width of a page of rows. The resources are a grid, which has more room. */
const ROWS_WIDTH = "tw:max-w-[46em]";

const PAGES = {
  createGame: { id: "lobby-create-game", Page: CreateGame, width: ROWS_WIDTH },
  watchReplay: { id: "lobby-replay", Page: WatchReplay, width: ROWS_WIDTH },
  resources: {
    id: "lobby-resources",
    Page: Resources,
    width: "tw:max-w-[64em]",
  },
  settings: { id: "lobby-settings", Page: SettingsPage, width: ROWS_WIDTH },
} as const satisfies Record<
  LobbyPage,
  {
    readonly id: string;
    readonly Page: () => React.JSX.Element;
    readonly width: string;
  }
>;

export function LobbyPages(): React.JSX.Element | undefined {
  const page = useAppSelector((state) => state.session.lobbyPage);
  if (page === undefined) {
    return undefined;
  }

  // Unlike the other boxes of the lobby, a page fits its content and scrolls when it is taller than
  // the lobby.
  const { id, Page, width } = PAGES[page];
  return (
    <section
      className={`box lobby-page tw:mx-auto tw:my-0 tw:h-auto tw:max-h-full tw:overflow-y-auto tw:p-6 ${width}`}
      id={id}
      key={page}
    >
      <Page />
    </section>
  );
}
