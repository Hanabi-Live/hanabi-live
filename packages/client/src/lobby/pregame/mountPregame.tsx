import { renderRoot } from "../../renderRoot.tsx";
import { getHTMLElement } from "../../utils.ts";
import { Pregame } from "./Pregame.tsx";
import { PregameChat } from "./PregameChat.tsx";

export function mountPregame(): void {
  renderRoot(getHTMLElement("#lobby-pregame"), <Pregame />);
  renderRoot(getHTMLElement("#lobby-chat-pregame"), <PregameChat />);
}
