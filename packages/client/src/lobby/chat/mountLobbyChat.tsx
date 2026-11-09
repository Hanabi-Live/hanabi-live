import { renderRoot } from "../../renderRoot";
import { getHTMLElement } from "../../utils";
import { LobbyChat } from "./LobbyChat";

export function mountLobbyChat(): void {
  renderRoot(getHTMLElement("#lobby-chat"), <LobbyChat />);
}
