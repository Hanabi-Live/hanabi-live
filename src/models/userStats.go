package models

import (
	"database/sql"
	"errors"
	"fmt"
)

type UserStats struct{}

// These are the stats for a user playing a specific variant + the total count of their games
type Stats struct {
	NumPlayedAll  int            `json:"numPlayedAll"`
	TimePlayed    sql.NullString `json:"timePlayed"`
	TimeRaced     sql.NullString `json:"timeRaced"`
	NumPlayed     int            `json:"numPlayed"`
	BestScores    []*BestScore   `json:"bestScores"`
	AverageScore  float64        `json:"averageScore"`
	StrikeoutRate float64        `json:"strikeoutRate"`
}
type BestScore struct {
	NumPlayers int `json:"numPlayers"`
	Score      int `json:"score"`
	Modifier   int `json:"modifier"` // (see the stats section in "gameEnd.go")
}

func (*UserStats) Get(userID int, variant int) (Stats, error) {
	var stats Stats
	stats.BestScores = make([]*BestScore, 5) // From 2 to 6 players
	for i := range stats.BestScores {
		// This will not work if written as "for i, bestScore :="
		stats.BestScores[i] = new(BestScore)
		stats.BestScores[i].NumPlayers = i + 2
	}

	// First, get the total amount of games (not including speedrun games)
	if err := db.QueryRow(`
		SELECT COUNT(games.id)
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = ?
			AND games.speedrun = 0
	`, userID).Scan(&stats.NumPlayedAll); err != nil {
		return stats, err
	}

	// Second, get the stats for this variant
	// If this variant has never been played, all the values will default to 0
	if err := db.QueryRow(`
		SELECT
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
	`, userID, variant).Scan(
		&stats.NumPlayed,
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
		&stats.StrikeoutRate,
	); err == sql.ErrNoRows {
		return stats, nil
	} else if err != nil {
		return stats, err
	}

	// Get the total amount of time spent in-game for non-speedruns
	if err := db.QueryRow(`
		SELECT SUM(TIMESTAMPDIFF(SECOND, datetime_started, datetime_finished)) as total_playtime
		FROM games, game_participants
		WHERE game_id = games.id
			AND user_id = ?
			AND games.speedrun = 0
	`, userID).Scan(&stats.TimePlayed); err != nil {
		return stats, err
	}

	// Get the total amount of time spent in-game for speedruns
	if err := db.QueryRow(`
		SELECT SUM(TIMESTAMPDIFF(SECOND, datetime_started, datetime_finished)) as total_playtime
		FROM games, game_participants
		WHERE game_id = games.id
			AND user_id = ?
			AND games.speedrun = 1
	`, userID).Scan(&stats.TimeRaced); err != nil {
		return stats, err
	}

	return stats, nil
}

func (*UserStats) Update(userID int, variant int, stats Stats) error {
	// Validate that the BestScores slice contains 5 entries
	if len(stats.BestScores) != 5 {
		return errors.New("BestScores does not contain 5 entries (for 2 to 6 players)")
	}

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
		defer stmt.Close()

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
			/*
				We enclose this query in an "IFNULL" so that it defaults to 0 (instead of NULL)
				if a user has not played any games
			*/
			strikeout_rate = IFNULL((
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = ?
					AND games.score = 0
					AND games.variant = ?
					AND games.speedrun = 0
			) / COALESCE(NULLIF((
				/*
					The above code means "default to 1 if the query returns 0"
					https://stackoverflow.com/questions/10246993/mysql-function-like-isnull-to-check-for-zero-value
					We want to avoid a division by 0 if a user is playing a game for the first time
					and it is a speedrun
				*/
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants
						ON game_participants.game_id = games.id
				WHERE game_participants.user_id = ?
					AND games.variant = ?
					AND games.speedrun = 0
			), 0), 1), 0)
		WHERE user_id = ?
			AND variant = ?
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	_, err := stmt.Exec(
		userID, // num_played
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
	defer stmt.Close()

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
			stats.BestScores = make([]*BestScore, 5) // From 2 to 6 players
			for i := range stats.BestScores {
				// This will not work if written as "for i, bestScore :="
				stats.BestScores[i] = new(BestScore)
				stats.BestScores[i].NumPlayers = i + 2
			}

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
