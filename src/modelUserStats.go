package main

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strconv"
)

type UserStats struct{}

// These are the stats for a user playing a specific variant + the total count of their games
type UserStatsRow struct {
	NumGames      int          `json:"numGames"`
	BestScores    []*BestScore `json:"bestScores"`
	AverageScore  float64      `json:"averageScore"`
	NumStrikeouts int          `json:"numStrikeouts"`
}
type BestScore struct {
	NumPlayers int `json:"numPlayers"`
	Score      int `json:"score"`
	Modifier   int `json:"modifier"` // (see the stats section in "gameEnd.go")
}

func NewUserStatsRow() UserStatsRow {
	var stats UserStatsRow
	stats.BestScores = make([]*BestScore, 5) // From 2 to 6 players
	for i := range stats.BestScores {
		// This will not work if written as "for i, bestScore :="
		stats.BestScores[i] = new(BestScore)
		stats.BestScores[i].NumPlayers = i + 2
	}
	return stats
}

func (*UserStats) Get(userID int, variant int) (UserStatsRow, error) {
	stats := NewUserStatsRow()

	if err := db.QueryRow(`
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
		WHERE user_id = ?
			AND variant = ?
	`, userID, variant).Scan(
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
	); err == sql.ErrNoRows {
		// This user has not played this variant before,
		// so return a stats object that contains all zero values
		return stats, nil
	} else if err != nil {
		return stats, err
	}

	return stats, nil
}

func (*UserStats) GetAll(userID int) (map[int]UserStatsRow, error) {
	// Get all of the statistics for this user (for every individual variant)
	rows, err := db.Query(`
		SELECT
			variant,
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
		WHERE user_id = ?
		ORDER BY variant ASC
	`, userID)

	// Go through the stats for each variant
	statsMap := make(map[int]UserStatsRow)
	for rows.Next() {
		stats := NewUserStatsRow()

		var variant int
		if err := rows.Scan(
			&variant,
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

func (*UserStats) Update(userID int, variant int, stats UserStatsRow) error {
	// Validate that the BestScores slice contains 5 entries
	if len(stats.BestScores) != 5 {
		return errors.New("BestScores does not contain 5 entries (for 2 to 6 players)")
	}

	// First, check to see if they have a row in the stats table for this variant already
	// If they don't, then we need to insert a new row
	var numRows int
	if err := db.QueryRow(`
		SELECT COUNT(user_id)
		FROM user_stats
		WHERE user_id = ?
			AND variant = ?
	`, userID, variant).Scan(&numRows); err != nil {
		return err
	}
	if numRows == 0 {
		var stmt *sql.Stmt
		if v, err := db.Prepare(`
			INSERT INTO user_stats (user_id, variant)
			VALUES (?, ?)
		`); err != nil {
			return err
		} else {
			stmt = v
		}
		defer stmt.Close()

		if _, err := stmt.Exec(userID, variant); err != nil {
			return err
		}
	}

	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		UPDATE user_stats
		SET
			num_games = (
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = ?
					AND games.variant = ?
					AND games.speedrun = 0
			),
			best_score2 = ?,
			best_score2_mod = ?,
			best_score3 = ?,
			best_score3_mod = ?,
			best_score4 = ?,
			best_score4_mod = ?,
			best_score5 = ?,
			best_score5_mod = ?,
			best_score6 = ?,
			best_score6_mod = ?,
			/*
				We enclose this query in an "IFNULL" so that it defaults to 0 (instead of NULL)
				if a user has not played any games
			*/
			average_score = (
				SELECT IFNULL(AVG(games.score), 0)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = ?
					AND games.score != 0
					AND games.variant = ?
					AND games.speedrun = 0
			),
			num_strikeouts = (
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = ?
					AND games.score = 0
					AND games.variant = ?
					AND games.speedrun = 0
			)
		WHERE user_id = ?
			AND variant = ?
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(
		userID, // num_games
		variant,
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
		userID, // average_score
		variant,
		userID, // num_strikeouts
		variant,
		userID, // WHERE
		variant,
	)
	return err
}

func (us *UserStats) UpdateAll(highestVariantID int) error {
	// Delete all of the existing rows
	var stmt *sql.Stmt
	if v, err := db.Prepare("TRUNCATE user_stats"); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	if _, err := stmt.Exec(); err != nil {
		return err
	}

	// Get all of the users
	rows, err := db.Query("SELECT id FROM users")

	var userIDs []int
	for rows.Next() {
		var userID int
		if err := rows.Scan(&userID); err != nil {
			return err
		}
		userIDs = append(userIDs, userID)
	}

	if rows.Err() != nil {
		return err
	}
	if err := rows.Close(); err != nil {
		return err
	}

	// Sort the user IDs (ascending)
	sort.Slice(userIDs, func(i, j int) bool {
		return userIDs[i] < userIDs[j]
	})
	fmt.Println("Total users:", len(userIDs))
	fmt.Println("(From user " + strconv.Itoa(userIDs[0]) + " " +
		"to user " + strconv.Itoa(userIDs[len(userIDs)-1]) + ".)")

	// Go through each user
	for _, userID := range userIDs {
		fmt.Println("Updating user:", userID)
		for variant := 0; variant <= highestVariantID; variant++ {
			// Check to see if this user has played any games of this variant
			var numRows int
			if err := db.QueryRow(`
				SELECT COUNT(game_participants.game_id)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = ?
					AND games.variant = ?
			`, userID, variant).Scan(&numRows); err != nil {
				return err
			}
			if numRows == 0 {
				// We don't need to insert a new row for this variant
				continue
			}

			// Update scores for players 2 through 6
			stats := NewUserStatsRow()
			for numPlayers := 2; numPlayers <= 6; numPlayers++ {
				overallBestScore := 0
				overallBestScoreMod := 0

				// Go through each modifier
				for modifier := 0; modifier <= 3; modifier++ {
					// Get the score for this player count and modifier
					var bestScore int
					SQLString := `
						SELECT IFNULL(MAX(games.score), 0)
						FROM games
							JOIN game_participants
								ON game_participants.game_id = games.id
						WHERE game_participants.user_id = ?
							AND games.variant = ?
							AND games.num_players = ?
					`
					if modifier == 0 {
						SQLString += `
							AND games.deck_plays = 0
							AND games.empty_clues = 0
						`
					} else if modifier == 1 {
						SQLString += `
							AND games.deck_plays = 1
							AND games.empty_clues = 0
						`
					} else if modifier == 2 {
						SQLString += `
							AND games.deck_plays = 0
							AND games.empty_clues = 1
						`
					} else if modifier == 3 {
						SQLString += `
							AND games.deck_plays = 1
							AND games.empty_clues = 1
						`
					}
					if err := db.QueryRow(
						SQLString,
						userID,
						variant,
						numPlayers,
					).Scan(&bestScore); err != nil {
						return err
					}

					if bestScore > overallBestScore {
						overallBestScore = bestScore
						overallBestScoreMod = modifier
					}
				}

				i := numPlayers - 2
				stats.BestScores[i].Score = overallBestScore
				stats.BestScores[i].Modifier = overallBestScoreMod
			}

			// Insert a new row for this user + variant
			if err := us.Update(userID, variant, stats); err != nil {
				return err
			}
		}
	}

	return nil
}
