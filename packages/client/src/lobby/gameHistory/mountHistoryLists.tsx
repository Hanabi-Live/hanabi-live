import { renderRoot } from "../../renderRoot";
import { getHTMLElement } from "../../utils";
import { HistoryList, OtherScoresList, ShownGameCount } from "./HistoryLists";

export function mountHistoryLists(): void {
  renderRoot(getHTMLElement("#lobby-history"), <HistoryList />);
  renderRoot(
    getHTMLElement("#lobby-history-other-scores"),
    <OtherScoresList />,
  );
  renderRoot(
    getHTMLElement("#nav-buttons-history-shown-games"),
    <ShownGameCount />,
  );
}
