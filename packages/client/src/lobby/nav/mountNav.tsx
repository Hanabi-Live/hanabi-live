import { renderRoot } from "../../renderRoot.tsx";
import { getHTMLElement } from "../../utils.ts";
import { Nav } from "./Nav.tsx";

export function mountNav(): void {
  renderRoot(getHTMLElement("#nav"), <Nav />);
}
