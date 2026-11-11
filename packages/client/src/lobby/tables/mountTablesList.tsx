import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { TablesList } from "./TablesList.tsx";

export function mountTablesList(): void {
  renderRoot(getHtmlElement("#lobby-games"), <TablesList />);
}
