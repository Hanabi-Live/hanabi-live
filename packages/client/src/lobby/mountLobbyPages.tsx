import { renderRoot } from "../renderRoot.tsx";
import { getHtmlElement } from "../utils.ts";
import { LobbyPages } from "./LobbyPages.tsx";

export function mountLobbyPages(): void {
  renderRoot(getHtmlElement("#lobby-pages"), <LobbyPages />);
}
