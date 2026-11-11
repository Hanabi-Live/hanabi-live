import { renderRoot } from "../../renderRoot.tsx";
import { getHTMLElement } from "../../utils.ts";
import { HistoryList, OtherScoresList } from "./HistoryLists.tsx";

export function mountHistoryLists(): void {
  renderRoot(getHTMLElement("#lobby-history"), <HistoryList />);
  renderRoot(
    getHTMLElement("#lobby-history-other-scores"),
    <OtherScoresList />,
  );
}
