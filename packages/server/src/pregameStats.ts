import type { UserID } from "@hanabi-live/data";
import { getVariant } from "@hanabi-live/game";
import type { TablePlayer } from "./interfaces/TablePlayer";
import { models } from "./models";

export async function getVariantStats(
  userID: UserID,
  variantName: string,
): Promise<TablePlayer["stats"]["variant"]> {
  const stats = await models.userStats.get(userID, getVariant(variantName).id);
  return {
    ...stats,
    bestScores: stats.bestScores.map((score) => ({
      ...score,
      deckPlays: hasModifier(score.modifier, 1),
      emptyClues: hasModifier(score.modifier, 2),
      oneExtraCard: hasModifier(score.modifier, 4),
      oneLessCard: hasModifier(score.modifier, 8),
      allOrNothing: hasModifier(score.modifier, 16),
    })),
  };
}

function hasModifier(modifier: number, flag: number) {
  return Math.floor(modifier / flag) % 2 === 1;
}

export async function getPregameStats(
  userID: UserID,
  variantName: string,
): Promise<TablePlayer["stats"]> {
  const [numGames, variant] = await Promise.all([
    models.games.getNumGamesForUser(userID, false),
    getVariantStats(userID, variantName),
  ]);
  return { numGames, variant };
}
