import { renderRoot } from "../../renderRoot.tsx";
import { getHtmlElement } from "../../utils.ts";
import { HistoryList, OtherScoresList } from "./HistoryLists.tsx";

export function mountHistoryLists(): void {
  renderRoot(getHtmlElement("#lobby-history"), <HistoryList />);
  renderRoot(
    getHtmlElement("#lobby-history-other-scores"),
    <OtherScoresList />,
  );
}
