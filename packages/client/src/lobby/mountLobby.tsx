import { renderRoot } from "../renderRoot.tsx";
import { getHtmlElement } from "../utils.ts";
import { Lobby, LOBBY_CLASS_NAME } from "./Lobby.tsx";

export function mountLobby(): void {
  const lobby = getHtmlElement("#lobby");
  lobby.classList.add(...LOBBY_CLASS_NAME.split(" "));
  renderRoot(lobby, <Lobby />);
}
