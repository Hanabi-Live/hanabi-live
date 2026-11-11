import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { Pregame } from "./Pregame.tsx";
import { PregameChat } from "./PregameChat.tsx";

export function mountPregame(): void {
  renderRoot(getHtmlElement("#lobby-pregame"), <Pregame />);
  renderRoot(getHtmlElement("#lobby-chat-pregame"), <PregameChat />);
}
