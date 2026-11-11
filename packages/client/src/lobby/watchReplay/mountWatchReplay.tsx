import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { WatchReplay } from "./WatchReplay.tsx";

export function mountWatchReplay(): void {
  renderRoot(getHtmlElement("#lobby-replay"), <WatchReplay />);
}
