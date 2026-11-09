import { renderRoot } from "../../renderRoot";
import { getHTMLElement } from "../../utils";
import { TablesList } from "./TablesList";

export function mountTablesList(): void {
  renderRoot(getHTMLElement("#lobby-games"), <TablesList />);
}
