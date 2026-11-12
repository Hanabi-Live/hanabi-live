import { renderRoot } from "../renderRoot.tsx";
import { getHtmlElement } from "../utils.ts";
import { Lobby } from "./Lobby.tsx";

export function mountLobby(): void {
  renderRoot(getHtmlElement("#lobby"), <Lobby />);
}
