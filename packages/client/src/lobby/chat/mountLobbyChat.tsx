import { renderRoot } from "../../renderRoot.tsx";
import { getHTMLElement } from "../../utils.ts";
import { LobbyChat } from "./LobbyChat.tsx";

export function mountLobbyChat(): void {
  renderRoot(getHTMLElement("#lobby-chat"), <LobbyChat />);
}
