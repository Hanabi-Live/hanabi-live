package models

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/Zamiell/hanabi-live/server/pkg/bestscore"
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/jackc/pgx/v4"
)

type UserStats struct {
	m *Models // Reverse reference
}

// These are the stats for a user playing a specific variant + the total count of their games.
type UserStatsRow struct {
	NumGames      int                    `json:"numGames"`
	BestScores    []*bestscore.BestScore `json:"bestScores"`
	AverageScore  float64                `json:"averageScore"`
	NumStrikeouts int                    `json:"numStrikeouts"`
}

func NewUserStatsRow() *UserStatsRow {
	return &UserStatsRow{
		NumGames:      0,
		BestScores:    bestscore.NewBestScores(),
		AverageScore:  0,
		NumStrikeouts: 0,
	}
}

func (us *UserStats) Get(ctx context.Context, userID int, variantID int) (*UserStatsRow, error) {
	SQLString := `
		SELECT
			num_games,
			best_score2,
			best_score2_mod,
			best_score3,
			best_score3_mod,
			best_score4,
			best_score4_mod,
			best_score5,
			best_score5_mod,
			best_score6,
			best_score6_mod,
			average_score,
			num_strikeouts
		FROM user_stats
		WHERE user_id = $1
			AND variant_id = $2
	`

	stats := NewUserStatsRow()
	if err := us.m.db.QueryRow(ctx, SQLString, userID, variantID).Scan(
		&stats.NumGames,
		&stats.BestScores[0].Score, // 2-player
		&stats.BestScores[0].Modifier,
		&stats.BestScores[1].Score, // 3-player
		&stats.BestScores[1].Modifier,
		&stats.BestScores[2].Score, // 4-player
		&stats.BestScores[2].Modifier,
		&stats.BestScores[3].Score, // 5-player
		&stats.BestScores[3].Modifier,
		&stats.BestScores[4].Score, // 6-player
		&stats.BestScores[4].Modifier,
		&stats.AverageScore,
		&stats.NumStrikeouts,
	); errors.Is(err, pgx.ErrNoRows) {
		// This user has not played this variant before,
		// so return a stats object that contains all zero values
		return stats, nil
	} else if err != nil {
		return stats, err
	}

	fillBestScores(stats.BestScores)

	return stats, nil
}

func (us *UserStats) GetAll(ctx context.Context, userID int) (map[int]*UserStatsRow, error) {
	SQLString := `
		SELECT
			variant_id,
			num_games,
			best_score2,
			best_score2_mod,
			best_score3,
			best_score3_mod,
			best_score4,
			best_score4_mod,
			best_score5,
			best_score5_mod,
			best_score6,
			best_score6_mod,
			average_score,
			num_strikeouts
		FROM user_stats
		WHERE user_id = $1
		ORDER BY variant_id ASC
	`

	// Get all of the statistics for this user (for every individual variant)
	statsMap := make(map[int]*UserStatsRow)
	var rows pgx.Rows
	if v, err := us.m.db.Query(ctx, SQLString, userID); err != nil {
		return statsMap, err
	} else {
		rows = v
	}

	// Go through the stats for each variant
	for rows.Next() {
		var variantID int
		stats := NewUserStatsRow()
		if err := rows.Scan(
			&variantID,
			&stats.NumGames,
			&stats.BestScores[0].Score, // 2-player
			&stats.BestScores[0].Modifier,
			&stats.BestScores[1].Score, // 3-player
			&stats.BestScores[1].Modifier,
			&stats.BestScores[2].Score, // 4-player
			&stats.BestScores[2].Modifier,
			&stats.BestScores[3].Score, // 5-player
			&stats.BestScores[3].Modifier,
			&stats.BestScores[4].Score, // 6-player
			&stats.BestScores[4].Modifier,
			&stats.AverageScore,
			&stats.NumStrikeouts,
		); err != nil {
			return statsMap, err
		}

		fillBestScores(stats.BestScores)

		statsMap[variantID] = stats
	}

	if err := rows.Err(); err != nil {
		return statsMap, err
	}
	rows.Close()

	return statsMap, nil
}

// Update inserts or updates the row for the user's stats.
// The stats passed in as an argument do not have to contain "NumGames", "AverageScore",
// or "NumStrikeouts"; those will be calculated from the database.
func (us *UserStats) Update(
	ctx context.Context,
	userID int,
	variantID int,
	stats *UserStatsRow,
) error {
	// Validate that the BestScores slice contains entries for every player amount
	if len(stats.BestScores) != bestscore.NumPlayerGameTypes {
		return fmt.Errorf("BestScores does not contain %v entries", bestscore.NumPlayerGameTypes)
	}

	SQLString1 := `
		SELECT COUNT(user_id)
		FROM user_stats
		WHERE user_id = $1
			AND variant_id = $2
	`

	// First, check to see if they have a row in the stats table for this variant already
	// If they don't, then we need to insert a new row
	var numRows int
	if err := us.m.db.QueryRow(ctx, SQLString1, userID, variantID).Scan(&numRows); err != nil {
		return err
	}
	if numRows > 1 {
		return fmt.Errorf(
			"found %v rows in the \"user_stats\" table for user %v (instead of 1 row)",
			numRows,
			userID,
		)
	}
	if numRows == 0 {
		SQLString2 := `
			INSERT INTO user_stats (user_id, variant_id)
			VALUES ($1, $2)
		`
		if _, err := us.m.db.Exec(ctx, SQLString2, userID, variantID); err != nil {
			return err
		}
	}

	SQLString3 := `
		UPDATE user_stats
		SET
			num_games = (
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = $1
					AND games.variant_id = $2
					AND games.speedrun = FALSE
			),
			best_score2 = $3,
			best_score2_mod = $4,
			best_score3 = $5,
			best_score3_mod = $6,
			best_score4 = $7,
			best_score4_mod = $8,
			best_score5 = $9,
			best_score5_mod = $10,
			best_score6 = $11,
			best_score6_mod = $12,
			average_score = (
				/**
				 * We enclose this query in an "COALESCE" so that it defaults to 0
				 * (instead of NULL) if the user has not played any games in this variant
				 */
				SELECT COALESCE(AVG(games.score), 0)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = $1
					AND games.score != 0
					AND games.variant_id = $2
					AND games.speedrun = FALSE
			),
			num_strikeouts = (
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = $1
					AND games.score = 0
					AND games.variant_id = $2
					AND games.speedrun = FALSE
			)
		WHERE user_id = $1
			AND variant_id = $2
	`

	_, err := us.m.db.Exec(
		ctx,
		SQLString3,
		userID, // num_games
		variantID,
		stats.BestScores[0].Score, // 2-player
		stats.BestScores[0].Modifier,
		stats.BestScores[1].Score, // 3-player
		stats.BestScores[1].Modifier,
		stats.BestScores[2].Score, // 4-player
		stats.BestScores[2].Modifier,
		stats.BestScores[3].Score, // 5-player
		stats.BestScores[3].Modifier,
		stats.BestScores[4].Score, // 6-player
		stats.BestScores[4].Modifier,
	)
	return err
}

func (us *UserStats) UpdateAll(ctx context.Context, highestVariantID int) error {
	// Delete all of the existing rows
	if _, err := us.m.db.Exec(ctx, "DELETE FROM user_stats"); err != nil {
		return err
	}

	// Get all of the users
	var rows pgx.Rows
	if v, err := us.m.db.Query(ctx, "SELECT id FROM users"); err != nil {
		return err
	} else {
		rows = v
	}

	userIDs := make([]int, 0)
	for rows.Next() {
		var userID int
		if err := rows.Scan(&userID); err != nil {
			return err
		}
		userIDs = append(userIDs, userID)
	}

	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()

	// Sort the user IDs (ascending)
	sort.Slice(userIDs, func(i, j int) bool {
		return userIDs[i] < userIDs[j]
	})
	us.m.logger.Debugf("Total users: %v", len(userIDs))
	us.m.logger.Debugf(
		"(From user %v to user %v.)",
		userIDs[0],
		userIDs[len(userIDs)-1],
	)

	// Go through each user
	for _, userID := range userIDs {
		us.m.logger.Debugf("Updating user: %v", userID)

		// Get the game IDs for this player
		var gameIDs []int
		if v, err := us.m.Games.GetGameIDsUser(ctx, userID, 0, 0); err != nil {
			return err
		} else {
			gameIDs = v
		}

		// Get the history for these game IDs
		var gameHistoryList []*GameHistory
		if v, err := us.m.Games.GetHistory(ctx, gameIDs); err != nil {
			return err
		} else {
			gameHistoryList = v
		}

		// Calculate their best scores for every variant
		statsMap := make(map[int]*UserStatsRow)
		for variantID := 0; variantID <= highestVariantID; variantID++ {
			// Go through the history, looking for games of this specific variant
			stats := NewUserStatsRow()
			totalScore := 0
			for _, gameHistory := range gameHistoryList {
				if variant, err := us.m.variantsManager.GetVariant(
					gameHistory.Options.VariantName,
				); err != nil {
					return err
				} else if variant.ID != variantID {
					continue
				}

				stats.NumGames++
				totalScore += gameHistory.Score
				if gameHistory.Score == 0 {
					stats.NumStrikeouts++
				}

				// We subtract 2 because the 0th entry is for a 2-player game, and so forth
				bestScoresIndex := gameHistory.Options.NumPlayers - 2 // nolint: gomnd
				bestScore := stats.BestScores[bestScoresIndex]
				modifier := gameHistory.Options.GetModifier()
				thisScore := &bestscore.BestScore{ // nolint: exhaustivestruct
					NumPlayers: gameHistory.Options.NumPlayers,
					Score:      gameHistory.Score,
					Modifier:   modifier,
				}
				if thisScore.IsBetterThan(bestScore) {
					bestScore.Score = gameHistory.Score
					bestScore.Modifier = modifier
				}
			}

			if stats.NumGames == 0 {
				// We don't need to insert a new row for this variant
				continue
			}

			stats.AverageScore = float64(totalScore) / float64(stats.NumGames)

			statsMap[variantID] = stats
		}

		// Bulk inserts rows for every variant that this user has played
		if len(statsMap) > 0 {
			if err := us.BulkInsert(ctx, userID, statsMap); err != nil {
				return err
			}
		}
	}

	return nil
}

func (us *UserStats) BulkInsert(
	ctx context.Context,
	userID int,
	statsMap map[int]*UserStatsRow,
) error {
	SQLString := `
		INSERT INTO user_stats (
			user_id,
			variant_id,
			num_games,
			best_score2,
			best_score2_mod,
			best_score3,
			best_score3_mod,
			best_score4,
			best_score4_mod,
			best_score5,
			best_score5_mod,
			best_score6,
			best_score6_mod,
			average_score,
			num_strikeouts
		)
		VALUES %s
	`
	numArgsPerRow := 15
	valueArgs := make([]interface{}, 0, numArgsPerRow*len(statsMap))
	for variantID, stats := range statsMap {
		valueArgs = append(
			valueArgs,
			userID,
			variantID,
			stats.NumGames,
			stats.BestScores[0].Score,
			stats.BestScores[0].Modifier,
			stats.BestScores[1].Score,
			stats.BestScores[1].Modifier,
			stats.BestScores[2].Score,
			stats.BestScores[2].Modifier,
			stats.BestScores[3].Score,
			stats.BestScores[3].Modifier,
			stats.BestScores[4].Score,
			stats.BestScores[4].Modifier,
			stats.AverageScore,
			stats.NumStrikeouts,
		)
	}
	SQLString = getBulkInsertSQLSimple(SQLString, numArgsPerRow, len(statsMap))

	_, err := us.m.db.Exec(ctx, SQLString, valueArgs...)
	return err
}

func fillBestScores(bestScores []*bestscore.BestScore) {
	// The modifiers are stored as a bitmask in the database,
	// so use the bitmask to set the boolean values
	for i := range bestScores {
		modifier := bestScores[i].Modifier
		if modifier.HasFlag(constants.ScoreModifierDeckPlays) {
			bestScores[i].DeckPlays = true
		}
		if modifier.HasFlag(constants.ScoreModifierEmptyClues) {
			bestScores[i].EmptyClues = true
		}
		if modifier.HasFlag(constants.ScoreModifierOneExtraCard) {
			bestScores[i].OneExtraCard = true
		}
		if modifier.HasFlag(constants.ScoreModifierOneLessCard) {
			bestScores[i].OneLessCard = true
		}
		if modifier.HasFlag(constants.ScoreModifierAllOrNothing) {
			bestScores[i].AllOrNothing = true
		}
	}
}
