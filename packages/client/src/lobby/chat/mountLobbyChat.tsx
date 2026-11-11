import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { LobbyChat } from "./LobbyChat.tsx";

export function mountLobbyChat(): void {
  renderRoot(getHtmlElement("#lobby-chat"), <LobbyChat />);
}
