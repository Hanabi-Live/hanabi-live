package main

import (
	"context"
	"errors"
	"strconv"

	"github.com/jackc/pgx/v4"
)

type VariantStats struct{}

type VariantStatsRow struct {
	NumGames      int
	BestScores    []*BestScore
	NumMaxScores  int
	AverageScore  float64
	NumStrikeouts int
}

func NewVariantStatsRow() VariantStatsRow {
	return VariantStatsRow{
		BestScores: NewBestScores(),
	}
}

func (*VariantStats) Get(variantID int) (VariantStatsRow, error) {
	stats := NewVariantStatsRow()

	// If this variant has never been played, all the values will default to 0
	if err := db.QueryRow(context.Background(), `
		SELECT
			num_games,
			best_score2,
			best_score3,
			best_score4,
			best_score5,
			best_score6,
			num_max_scores,
			average_score,
			num_strikeouts
		FROM variant_stats
		WHERE variant_id = $1
	`, variantID).Scan(
		&stats.NumGames,
		&stats.BestScores[0].Score, // 2-player
		&stats.BestScores[1].Score, // 3-player
		&stats.BestScores[2].Score, // 4-player
		&stats.BestScores[3].Score, // 5-player
		&stats.BestScores[4].Score, // 6-player
		&stats.NumMaxScores,
		&stats.AverageScore,
		&stats.NumStrikeouts,
	); err == pgx.ErrNoRows {
		return stats, nil
	} else if err != nil {
		return stats, err
	}

	return stats, nil
}

func (*VariantStats) GetAll() (map[int]VariantStatsRow, error) {
	statsMap := make(map[int]VariantStatsRow)

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT
			variant_id,
			num_games,
			best_score2,
			best_score3,
			best_score4,
			best_score5,
			best_score6,
			num_max_scores,
			average_score,
			num_strikeouts
		FROM variant_stats
	`); err != nil {
		return statsMap, err
	} else {
		rows = v
	}

	// Go through the stats for each variant
	for rows.Next() {
		stats := NewVariantStatsRow()

		var variantID int
		if err := rows.Scan(
			&variantID,
			&stats.NumGames,
			&stats.BestScores[0].Score, // 2-player
			&stats.BestScores[1].Score, // 3-player
			&stats.BestScores[2].Score, // 4-player
			&stats.BestScores[3].Score, // 5-player
			&stats.BestScores[4].Score, // 6-player
			&stats.NumMaxScores,
			&stats.AverageScore,
			&stats.NumStrikeouts,
		); err != nil {
			return statsMap, err
		}

		statsMap[variantID] = stats
	}

	if err := rows.Err(); err != nil {
		return statsMap, err
	}
	rows.Close()

	return statsMap, nil
}

func (*VariantStats) Update(variantID int, maxScore int, stats VariantStatsRow) error {
	// Validate that the BestScores slice contains 5 entries
	if len(stats.BestScores) != 5 {
		return errors.New("BestScores does not contain 5 entries (for 2 to 6 players)")
	}

	// First, check to see if there is a row in the table for this variant already
	// If not, we need to insert a new one
	var numRows int
	if err := db.QueryRow(context.Background(), `
		SELECT COUNT(variant_id)
		FROM variant_stats
		WHERE variant_id = $1
	`, variantID).Scan(&numRows); err != nil {
		return err
	}
	if numRows > 1 {
		return errors.New("found " + strconv.Itoa(numRows) +
			" rows in the \"variant_stats\" table for variant " + strconv.Itoa(variantID) +
			" (instead of 1 row)")
	}
	if numRows == 0 {
		if _, err := db.Exec(context.Background(), `
			INSERT INTO variant_stats (variant_id)
			VALUES ($1)
		`, variantID); err != nil {
			return err
		}
	}

	_, err := db.Exec(
		context.Background(),
		`
			UPDATE variant_stats
			SET
				num_games = (
					SELECT COUNT(id)
					FROM games
					WHERE variant_id = $1
						AND speedrun = FALSE
				),
				best_score2 = $2,
				best_score3 = $3,
				best_score4 = $4,
				best_score5 = $5,
				best_score6 = $6,
				num_max_scores = (
					SELECT COUNT(id)
					FROM games
					WHERE variant_id = $1
						AND score = $7
						AND speedrun = FALSE
				),
				average_score = (
					/*
					 * We enclose this query in an "COALESCE" so that it defaults to 0
					 * (instead of NULL) if there have been 0 games played on this variant
					 */
					 SELECT COALESCE(AVG(score), 0)
					 FROM games
					 WHERE variant_id = $1
						AND score != 0
						AND speedrun = FALSE
				),
				num_strikeouts = (
					SELECT COUNT(id)
					FROM games
					WHERE variant_id = $1
						AND score = 0
						AND speedrun = FALSE
				)
			WHERE variant_id = $1
		`,
		variantID,                 // num_games
		stats.BestScores[0].Score, // 2-player
		stats.BestScores[1].Score, // 3-player
		stats.BestScores[2].Score, // 4-player
		stats.BestScores[3].Score, // 5-player
		stats.BestScores[4].Score, // 6-player
		maxScore,                  // num_max_scores
	)
	return err
}

func (vs *VariantStats) UpdateAll(highestVariantID int, maxScores []int) error {
	// Delete all of the existing rows
	if _, err := db.Exec(context.Background(), "DELETE FROM variant_stats"); err != nil {
		return err
	}

	for variantID := 0; variantID <= highestVariantID; variantID++ {
		// Check to see if any users have played a game of this variant
		var numGames int
		if err := db.QueryRow(context.Background(), `
			SELECT COUNT(id)
			FROM games
			WHERE variant_id = $1
		`, variantID).Scan(&numGames); err != nil {
			return err
		}
		if numGames == 0 {
			// We don't need to insert a new row for this variant
			continue
		}

		// Update scores for players 2 through 6
		stats := NewVariantStatsRow()
		for numPlayers := 2; numPlayers <= 6; numPlayers++ {
			overallBestScore := 0

			// Get the score for this player count (using a modifier of 0)
			var bestScore int
			if err := db.QueryRow(context.Background(), `
				/*
				 * We enclose this query in an "COALESCE" so that it defaults to 0
				 * (instead of NULL) if there have been 0 games played on this variant
				 */
				SELECT COALESCE(MAX(games.score), 0)
				FROM games
				WHERE variant_id = $1
					AND num_players = $2
					AND games.deck_plays = FALSE
					AND games.empty_clues = FALSE
					AND games.one_extra_card = FALSE
					AND games.one_less_card = FALSE
					AND games.all_or_nothing = FALSE
			`, variantID, numPlayers).Scan(&bestScore); err != nil {
				return err
			}

			if bestScore > overallBestScore {
				overallBestScore = bestScore
			}

			i := numPlayers - 2
			stats.BestScores[i].Score = overallBestScore
		}

		// Insert a new row for this variant
		if err := vs.Update(variantID, maxScores[variantID], stats); err != nil {
			return err
		}
	}

	return nil
}
