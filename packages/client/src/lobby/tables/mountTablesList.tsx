import { renderRoot } from "../../renderRoot.tsx";
import { getHTMLElement } from "../../utils.ts";
import { TablesList } from "./TablesList.tsx";

export function mountTablesList(): void {
  renderRoot(getHTMLElement("#lobby-games"), <TablesList />);
}
