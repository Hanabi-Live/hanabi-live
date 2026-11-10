import { renderRoot } from "../../renderRoot";
import { getHTMLElement } from "../../utils";
import { Pregame } from "./Pregame";
import { PregameChat } from "./PregameChat";

export function mountPregame(): void {
  renderRoot(getHTMLElement("#lobby-pregame"), <Pregame />);
  renderRoot(getHTMLElement("#lobby-chat-pregame"), <PregameChat />);
}
