import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { CREATE_GAME_SECTION } from "../createGame.ts";
import { CreateGame } from "./CreateGame.tsx";

export function mountCreateGame(): void {
  renderRoot(getHtmlElement(CREATE_GAME_SECTION), <CreateGame />);
}
