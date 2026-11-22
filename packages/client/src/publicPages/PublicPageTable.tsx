import type { publicPageTableSchema } from "@hanabi-live/data";
import type * as z from "zod";
import { GameList } from "../gameList/GameList.tsx";
import { Achievements } from "./Achievements.tsx";
import { MissingScoresTable } from "./MissingScoresTable.tsx";
import { ProfileStatistics } from "./ProfileStatistics.tsx";

export function PublicPageTable({
  table,
}: {
  readonly table: z.infer<typeof publicPageTableSchema>;
}): React.JSX.Element {
  switch (table.type) {
    case "profile": {
      return (
        <>
          <ProfileStatistics statistics={table.statistics} />
          <Achievements achievements={table.achievements} />
        </>
      );
    }

    case "missingScores": {
      return <MissingScoresTable table={table} />;
    }

    case "games": {
      return <GameList table={table} />;
    }
  }
}
