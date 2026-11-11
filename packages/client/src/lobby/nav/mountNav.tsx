import { renderRoot } from "../../renderRoot";
import { getHTMLElement } from "../../utils";
import { Nav } from "./Nav";

export function mountNav(): void {
  renderRoot(getHTMLElement("#nav"), <Nav />);
}
