import { getVariant } from "@hanabi-live/game";
import type postgres from "postgres";
import type { CompletedGame } from "./gameStore";

export async function refreshGameStatistics(
  client: postgres.Sql,
  game: CompletedGame,
  check: () => void,
): Promise<void> {
  const variant = getVariant(game.options.variantName);
  const modifier =
    Number(game.options.deckPlays)
    + 2 * Number(game.options.emptyClues)
    + 4 * Number(game.options.oneExtraCard)
    + 8 * Number(game.options.oneLessCard)
    + 16 * Number(game.options.allOrNothing);
  const scoreColumn = `best_score${game.options.numPlayers}`;
  const modifierColumn = `${scoreColumn}_mod`;

  await client.begin(async (tx) => {
    check();
    const stored = await tx`SELECT id FROM games WHERE id = ${game.id}`;
    check();
    if (stored.length !== 1) {
      throw new Error("Cannot refresh statistics for an uncommitted game.");
    }
    await tx`
      INSERT INTO seeds (seed, num_games) VALUES (${game.seed}, 0)
      ON CONFLICT (seed) DO NOTHING
    `;
    check();
    await tx`SELECT seed FROM seeds WHERE seed = ${game.seed} FOR UPDATE`;
    check();
    await tx`
      UPDATE seeds SET num_games = (SELECT COUNT(*) FROM games WHERE seed = ${game.seed})
      WHERE seed = ${game.seed}
    `;
    check();
  });

  await client.begin(async (tx) => {
    check();
    await tx`
      INSERT INTO variant_stats (variant_id) VALUES (${variant.id})
      ON CONFLICT (variant_id) DO NOTHING
    `;
    check();
    await tx`SELECT variant_id FROM variant_stats WHERE variant_id = ${variant.id} FOR UPDATE`;
    check();
    const better = tx`
      ${game.score} > ${tx(scoreColumn)}
      OR (${game.score} = ${tx(scoreColumn)} AND ${modifier} < ${tx(modifierColumn)})
    `;
    for (const player of game.players) {
      // Refreshes are serialized on the variant row, as in Go.
      // eslint-disable-next-line no-await-in-loop
      await tx`
        INSERT INTO user_stats (user_id, variant_id) VALUES (${player.userID}, ${variant.id})
        ON CONFLICT (user_id, variant_id) DO NOTHING
      `;
      check();
      // eslint-disable-next-line no-await-in-loop
      await tx`
        UPDATE user_stats
        SET
          ${tx(scoreColumn)} = CASE WHEN ${better} THEN ${game.score} ELSE ${tx(scoreColumn)} END,
          ${tx(modifierColumn)} = CASE WHEN ${better} THEN ${modifier} ELSE ${tx(modifierColumn)} END,
          num_games = summary.num_games,
          average_score = summary.average_score,
          num_strikeouts = summary.num_strikeouts
        FROM (
          SELECT
            COUNT(*) AS num_games,
            COALESCE(AVG(games.score) FILTER (WHERE games.score <> 0), 0) AS average_score,
            COUNT(*) FILTER (WHERE games.score = 0) AS num_strikeouts
          FROM games JOIN game_participants ON game_participants.game_id = games.id
          WHERE game_participants.user_id = ${player.userID}
            AND games.variant_id = ${variant.id} AND games.speedrun = FALSE
        ) summary
        WHERE user_stats.user_id = ${player.userID} AND user_stats.variant_id = ${variant.id}
      `;
      check();
    }
    await tx`
      UPDATE variant_stats
      SET
        ${tx(scoreColumn)} = CASE WHEN ${modifier} = 0
          THEN GREATEST(${tx(scoreColumn)}, ${game.score}) ELSE ${tx(scoreColumn)} END,
        num_games = summary.num_games,
        num_max_scores = summary.num_max_scores,
        average_score = summary.average_score,
        num_strikeouts = summary.num_strikeouts
      FROM (
        SELECT
          COUNT(*) AS num_games,
          COUNT(*) FILTER (WHERE score = ${variant.maxScore}) AS num_max_scores,
          COALESCE(AVG(score) FILTER (WHERE score <> 0), 0) AS average_score,
          COUNT(*) FILTER (WHERE score = 0) AS num_strikeouts
        FROM games WHERE variant_id = ${variant.id} AND speedrun = FALSE
      ) summary
      WHERE variant_stats.variant_id = ${variant.id}
    `;
    check();
  });
}
