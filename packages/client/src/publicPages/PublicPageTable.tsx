import type { publicPageTableSchema } from "@hanabi-live/data";
import type * as z from "zod";
import { GameList } from "../gameList/GameList.tsx";
import { MissingScoresTable, ScoresTable } from "./ScoreTables.tsx";

export function PublicPageTable({
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
      return <GameList table={table} />;
    }
  }
}
