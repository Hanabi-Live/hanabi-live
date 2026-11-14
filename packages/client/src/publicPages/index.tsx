// The script of the server's public pages, such as a player's scores or history. It draws the table
// whose data the server puts in the page, with the controls and the chart that go with it, or the
// form of the password reset page.

import { publicPageTableSchema } from "@hanabi-live/data";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type * as z from "zod";
import "../tailwind.css"; // eslint-disable-line import-x/no-unassigned-import
import { GamesTable } from "./GamesTable.tsx";
import { PasswordReset } from "./PasswordReset.tsx";
import { MissingScoresTable, ScoresTable } from "./ScoreTables.tsx";

const passwordReset = document.querySelector("#password-reset");
if (passwordReset === null) {
  renderTable();
} else {
  createRoot(passwordReset).render(
    <StrictMode>
      <PasswordReset />
    </StrictMode>,
  );
}

function renderTable() {
  const container = document.querySelector<HTMLElement>("#public-page-table");
  if (container === null) {
    throw new Error('The page has no "#public-page-table" element.');
  }
  const table = publicPageTableSchema.parse(
    JSON.parse(container.dataset["table"] ?? ""),
  );

  createRoot(container).render(
    <StrictMode>
      <PublicPageTable table={table} />
    </StrictMode>,
  );
}

function PublicPageTable({
  table,
}: {
  readonly table: z.infer<typeof publicPageTableSchema>;
}): React.JSX.Element {
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
