import { renderRoot } from "../../renderRoot";
import { getHTMLElement } from "../../utils";
import { PregameChat } from "./PregameChat";

export function mountPregame(): void {
  renderRoot(getHTMLElement("#lobby-chat-pregame"), <PregameChat />);
}
