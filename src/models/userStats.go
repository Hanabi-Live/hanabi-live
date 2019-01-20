package models

import (
	"database/sql"
	"fmt"
)

type UserStats struct{}

// These are the stats for a user playing a specific variant + the total count of their games
type Stats struct {
	NumPlayedAll  int     `json:"numPlayedAll"`
	NumPlayed     int     `json:"numPlayed"`
	BestScore2    int     `json:"bestScore2"`
	BestScore2Mod int     `json:"bestScore2Mod"`
	BestScore3    int     `json:"bestScore3"`
	BestScore3Mod int     `json:"bestScore3Mod"`
	BestScore4    int     `json:"bestScore4"`
	BestScore4Mod int     `json:"bestScore4Mod"`
	BestScore5    int     `json:"bestScore5"`
	BestScore5Mod int     `json:"bestScore5Mod"`
	BestScore6    int     `json:"bestScore6"`
	BestScore6Mod int     `json:"bestScore6Mod"`
	AverageScore  float64 `json:"averageScore"`
	StrikeoutRate float64 `json:"strikeoutRate"`
}

func (*UserStats) Get(userID int, variant int) (Stats, error) {
	var stats Stats
	if err := db.QueryRow(`
		SELECT
			(
				SELECT COUNT(id)
				FROM game_participants
				WHERE user_id = ?
			) AS num_played_all,
			num_played,
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
			strikeout_rate
		FROM user_stats
		WHERE user_id = ?
			AND variant = ?
	`, userID, userID, variant).Scan(
		&stats.NumPlayedAll,
		&stats.NumPlayed,
		&stats.BestScore2,
		&stats.BestScore2Mod,
		&stats.BestScore3,
		&stats.BestScore3Mod,
		&stats.BestScore4,
		&stats.BestScore4Mod,
		&stats.BestScore5,
		&stats.BestScore5Mod,
		&stats.BestScore6,
		&stats.BestScore6Mod,
		&stats.AverageScore,
		&stats.StrikeoutRate,
	); err == sql.ErrNoRows {
		return stats, nil
	} else if err != nil {
		return stats, err
	}

	return stats, nil
}

func (*UserStats) Update(userID int, variant int, stats Stats) error {
	// First, check to see if they have a row in the stats table for this variant already
	// If they don't, then we need to insert a new row
	var numRows int
	if err := db.QueryRow(`
		SELECT COUNT(id)
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
		defer stmt.Close() // nolint: errcheck

		if _, err := stmt.Exec(userID, variant); err != nil {
			return err
		}
	}

	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		UPDATE user_stats
		SET
			num_played = (
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = ?
					AND games.variant = ?
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
			average_score = (
				SELECT IFNULL(AVG(games.score), 0)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = ?
					AND games.score != 0
					AND games.variant = ?
			),
			strikeout_rate = IFNULL((
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = ?
					AND games.score = 0
					AND games.variant = ?
			) / (
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = ?
					AND games.variant = ?
			), 0)

		WHERE user_id = ?
			AND variant = ?
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close() // nolint: errcheck

	_, err := stmt.Exec(
		userID, // num_played
		variant,
		stats.BestScore2,
		stats.BestScore2Mod,
		stats.BestScore3,
		stats.BestScore3Mod,
		stats.BestScore4,
		stats.BestScore4Mod,
		stats.BestScore5,
		stats.BestScore5Mod,
		stats.BestScore6,
		stats.BestScore6Mod,
		userID, // average_score
		variant,
		userID, // strikeout_rate
		variant,
		userID,
		variant,
		userID, // WHERE
		variant,
	)
	return err
}

func (us *UserStats) UpdateAll(highestVariantID int) error {
	// Delete all of the existing rows
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		TRUNCATE user_stats
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close() // nolint: errcheck

	if _, err := stmt.Exec(); err != nil {
		return err
	}

	// Get all of the users
	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT id FROM users
	`); err != nil {
		return err
	} else {
		rows = v
	}

	// Go through each user
	for rows.Next() {
		var userID int
		if err := rows.Scan(&userID); err != nil {
			return err
		}

		fmt.Println("Updating user:", userID)
		for variant := 0; variant <= highestVariantID; variant++ {
			// Check to see if this user has played any games of this variant
			var numRows int
			if err := db.QueryRow(`
				SELECT COUNT(game_participants.id)
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
			var stats Stats
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
					if err := db.QueryRow(SQLString, userID, variant, numPlayers).Scan(&bestScore); err != nil {
						return err
					}

					if bestScore > overallBestScore {
						overallBestScore = bestScore
						overallBestScoreMod = modifier
					}
				}

				if numPlayers == 2 {
					stats.BestScore2 = overallBestScore
					stats.BestScore2Mod = overallBestScoreMod
				} else if numPlayers == 3 {
					stats.BestScore3 = overallBestScore
					stats.BestScore3Mod = overallBestScoreMod
				} else if numPlayers == 4 {
					stats.BestScore4 = overallBestScore
					stats.BestScore4Mod = overallBestScoreMod
				} else if numPlayers == 5 {
					stats.BestScore5 = overallBestScore
					stats.BestScore5Mod = overallBestScoreMod
				} else if numPlayers == 6 {
					stats.BestScore6 = overallBestScore
					stats.BestScore6Mod = overallBestScoreMod
				}
			}

			// Insert a new row for this user + variant
			if err := us.Update(userID, variant, stats); err != nil {
				return err
			}
		}
	}

	return nil
}
