package main

import (
	"database/sql"
	"errors"
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
	if err := db.QueryRow(`
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
		WHERE variant = ?
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
	); err == sql.ErrNoRows {
		return stats, nil
	} else if err != nil {
		return stats, err
	}

	return stats, nil
}

func (*VariantStats) GetAll(variantsID map[int]string) (map[int]VariantStatsRow, error) {
	rows, err := db.Query(`
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
		if err := rows.Scan(
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
		); err != nil {
			return nil, err
		}

		statsMap[variant] = stats
	}

	if rows.Err() != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

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
	if err := db.QueryRow(`
		SELECT COUNT(variant)
		FROM variant_stats
		WHERE variant = ?
	`, variant).Scan(&numRows); err != nil {
		return err
	}
	if numRows == 0 {
		var stmt *sql.Stmt
		if v, err := db.Prepare(`
			INSERT INTO variant_stats (variant)
			VALUES (?)
		`); err != nil {
			return err
		} else {
			stmt = v
		}
		defer stmt.Close()

		if _, err := stmt.Exec(variant); err != nil {
			return err
		}
	}

	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		UPDATE variant_stats
		SET
			num_games = (
				SELECT COUNT(games.id)
				FROM games
				WHERE variant = ?
					AND games.speedrun = 0
			),
			best_score2 = ?,
			best_score3 = ?,
			best_score4 = ?,
			best_score5 = ?,
			best_score6 = ?,
			/*
				We enclose this query in an "IFNULL" so that it defaults to 0 (instead of NULL)
				if there have been 0 games played on this variant
			*/
			num_max_scores = (
				SELECT COUNT(games.id)
				FROM games
				WHERE variant = ?
					AND score = ?
					AND speedrun = 0
			),
			average_score = (
				SELECT IFNULL(AVG(score), 0)
				FROM games
				WHERE variant = ?
					AND score != 0
					AND speedrun = 0
			),
			num_strikeouts = (
				SELECT COUNT(id)
				FROM games
				WHERE variant = ?
					AND score = 0
					AND speedrun = 0
			)
		WHERE variant = ?
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(
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
	var stmt *sql.Stmt
	if v, err := db.Prepare("TRUNCATE variant_stats"); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	if _, err := stmt.Exec(); err != nil {
		return err
	}

	for variant := 0; variant <= highestVariantID; variant++ {
		// Check to see if any users have played a game of this variant
		var numRows int
		if err := db.QueryRow(`
			SELECT COUNT(id)
			FROM games
			WHERE variant = ?
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
			if err := db.QueryRow(`
				SELECT IFNULL(MAX(games.score), 0)
				FROM games
				WHERE variant = ?
					AND num_players = ?
					AND games.deck_plays = 0
					AND games.empty_clues = 0
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
