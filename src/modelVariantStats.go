package main

import (
	"context"
	"errors"

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
	var stats VariantStatsRow
	stats.BestScores = make([]*BestScore, 5) // From 2 to 6 players
	for i := range stats.BestScores {
		// This will not work if written as "for i, bestScore :="
		stats.BestScores[i] = new(BestScore)
		stats.BestScores[i].NumPlayers = i + 2
	}
	return stats
}

func (*VariantStats) Get(variant int) (VariantStatsRow, error) {
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
		WHERE variant = $1
	`, variant).Scan(
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

func (*VariantStats) GetAll(variantsID map[int]string) (map[int]VariantStatsRow, error) {
	rows, err := db.Query(context.Background(), `
		SELECT
			variant,
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
	`)

	// Go through the stats for each variant
	statsMap := make(map[int]VariantStatsRow)
	for rows.Next() {
		stats := NewVariantStatsRow()

		var variant int
		if err2 := rows.Scan(
			&variant,
			&stats.NumGames,
			&stats.BestScores[0].Score, // 2-player
			&stats.BestScores[1].Score, // 3-player
			&stats.BestScores[2].Score, // 4-player
			&stats.BestScores[3].Score, // 5-player
			&stats.BestScores[4].Score, // 6-player
			&stats.NumMaxScores,
			&stats.AverageScore,
			&stats.NumStrikeouts,
		); err2 != nil {
			return nil, err2
		}

		statsMap[variant] = stats
	}

	if rows.Err() != nil {
		return nil, err
	}
	rows.Close()

	return statsMap, nil
}

func (*VariantStats) Update(variant int, maxScore int, stats VariantStatsRow) error {
	// Validate that the BestScores slice contains 5 entries
	if len(stats.BestScores) != 5 {
		return errors.New("BestScores does not contain 5 entries (for 2 to 6 players)")
	}

	// First, check to see if there is a row in the table for this variant already
	// If not, we need to insert a new one
	var numRows int
	if err := db.QueryRow(context.Background(), `
		SELECT COUNT(variant)
		FROM variant_stats
		WHERE variant = $1
	`, variant).Scan(&numRows); err != nil {
		return err
	}
	if numRows == 0 {
		if _, err := db.Exec(context.Background(), `
			INSERT INTO variant_stats (variant)
			VALUES ($1)
		`, variant); err != nil {
			return err
		}
	}

	_, err := db.Exec(
		context.Background(),
		`
			UPDATE variant_stats
			SET
				num_games = (
					SELECT COUNT(games.id)
					FROM games
					WHERE variant = $1
						AND games.speedrun = FALSE
				),
				best_score2 = $2,
				best_score3 = $3,
				best_score4 = $4,
				best_score5 = $5,
				best_score6 = $6,
				num_max_scores = (
					SELECT COUNT(games.id)
					FROM games
					WHERE variant = $7
						AND score = $8
						AND speedrun = FALSE
				),
				average_score = (
					/*
					 * We enclose this query in an "COALESCE" so that it defaults to 0 (instead of
					 * NULL) if there have been 0 games played on this variant
					 */
					 SELECT COALESCE(AVG(score), 0)
					 FROM games
					 WHERE variant = $9
						AND score != 0
						AND speedrun = FALSE
				),
				num_strikeouts = (
					SELECT COUNT(id)
					FROM games
					WHERE variant = $10
						AND score = 0
						AND speedrun = FALSE
				)
			WHERE variant = $11
		`,
		variant,                   // num_games
		stats.BestScores[0].Score, // 2-player
		stats.BestScores[1].Score, // 3-player
		stats.BestScores[2].Score, // 4-player
		stats.BestScores[3].Score, // 5-player
		stats.BestScores[4].Score, // 6-player
		variant,                   // num_max_scores
		maxScore,
		variant, // average_score
		variant, // num_strikeouts
		variant, // WHERE
	)
	return err
}

func (vs *VariantStats) UpdateAll(highestVariantID int, maxScores []int) error {
	// Delete all of the existing rows
	if _, err := db.Exec(context.Background(), "DELETE FROM variant_stats"); err != nil {
		return err
	}

	for variant := 0; variant <= highestVariantID; variant++ {
		// Check to see if any users have played a game of this variant
		var numRows int
		if err := db.QueryRow(context.Background(), `
			SELECT COUNT(id)
			FROM games
			WHERE variant = $1
		`, variant).Scan(&numRows); err != nil {
			return err
		}
		if numRows == 0 {
			// We don't need to insert a new row for this variant
			continue
		}

		// Update scores for players 2 through 6
		stats := NewVariantStatsRow()
		for numPlayers := 2; numPlayers <= 6; numPlayers++ {
			overallBestScore := 0

			// Get the score for this player count (using no modifiers)
			var bestScore int
			if err := db.QueryRow(context.Background(), `
				SELECT COALESCE(MAX(games.score), 0)
				FROM games
				WHERE variant = $1
					AND num_players = $2
					AND games.deck_plays = FALSE
					AND games.empty_clues = FALSE
			`, variant, numPlayers).Scan(&bestScore); err != nil {
				return err
			}

			if bestScore > overallBestScore {
				overallBestScore = bestScore
			}

			i := numPlayers - 2
			stats.BestScores[i].Score = overallBestScore
		}

		// Insert a new row for this variant
		if err := vs.Update(variant, maxScores[variant], stats); err != nil {
			return err
		}
	}

	return nil
}
