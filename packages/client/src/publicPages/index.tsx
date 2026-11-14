// The script of the server's public pages, such as a player's scores or history. It draws the table
// whose data the server puts in the page, with the controls and the chart that go with it.

import { publicPageTableSchema } from "@hanabi-live/data";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../tailwind.css"; // eslint-disable-line import-x/no-unassigned-import
import { GamesTable } from "./GamesTable.tsx";
import { MissingScoresTable, ScoresTable } from "./ScoreTables.tsx";

const container = document.querySelector<HTMLElement>("#public-page-table");
if (container === null) {
  throw new Error('The page has no "#public-page-table" element.');
}
const table = publicPageTableSchema.parse(
  JSON.parse(container.dataset["table"] ?? ""),
);

function PublicPageTable() {
  switch (table.type) {
    case "scores": {
      return <ScoresTable table={table} />;
    }

    case "missingScores": {
      return <MissingScoresTable table={table} />;
    }

    case "games": {
      return <GamesTable table={table} />;
    }
  }
}

createRoot(container).render(
  <StrictMode>
    <PublicPageTable />
  </StrictMode>,
);
