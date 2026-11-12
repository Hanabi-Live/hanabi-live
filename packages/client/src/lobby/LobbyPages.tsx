// Shows the lobby page that the store names, in place of the lobby. A page starts again each time
// that it shows.

import { useAppSelector } from "../store.ts";
import { CreateGame } from "./createGame/CreateGame.tsx";
import { Resources } from "./resources/Resources.tsx";
import { SettingsPage } from "./settings/SettingsPage.tsx";
import type { LobbyPage } from "./types/LobbyPage.ts";
import { WatchReplay } from "./watchReplay/WatchReplay.tsx";

const PAGES = {
  createGame: { id: "lobby-create-game", Page: CreateGame, className: "" },
  watchReplay: { id: "lobby-replay", Page: WatchReplay, className: "" },
  resources: {
    id: "lobby-resources",
    Page: Resources,
    className: "tw:max-w-[64em]",
  },
  settings: { id: "lobby-settings", Page: SettingsPage, className: "" },
} as const satisfies Record<
  LobbyPage,
  {
    readonly id: string;
    readonly Page: () => React.JSX.Element;
    readonly className: string;
  }
>;

export function LobbyPages(): React.JSX.Element | undefined {
  const page = useAppSelector((state) => state.session.lobbyPage);
  if (page === undefined) {
    return undefined;
  }

  const { id, Page, className } = PAGES[page];
  return (
    <section
      className={`box lobby-page tw:mb-0 tw:p-6 ${className}`}
      id={id}
      key={page}
    >
      <Page />
    </section>
  );
}
