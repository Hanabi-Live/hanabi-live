package models

import (
	"database/sql"
)

type Users struct{}

type User struct {
	ID       int
	Username string
	Password string
}

func (*Users) Insert(username string, password string) (User, error) {
	var user User

	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO users (username, password)
		VALUES (?, ?)
	`); err != nil {
		return user, err
	} else {
		stmt = v
	}
	defer stmt.Close()

	var res sql.Result
	if v, err := stmt.Exec(username, password); err != nil {
		return user, err
	} else {
		res = v
	}

	var id int
	if v, err := res.LastInsertId(); err != nil {
		return user, err
	} else {
		id = int(v)
	}

	return User{
		ID:       id,
		Username: username,
		Password: password,
	}, nil
}

// We get the existing username in case they submitted the wrong case
func (*Users) Get(username string) (bool, User, error) {
	var user User
	if err := db.QueryRow(`
		SELECT id, username, password
		FROM users
		WHERE username = ?
	`, username).Scan(&user.ID, &user.Username, &user.Password); err == sql.ErrNoRows {
		return false, user, nil
	} else if err != nil {
		return false, user, err
	}

	return true, user, nil
}

type Stats struct {
	NumPlayed            int
	NumPlayedVariant     int
	BestScoreVariant3    int
	BestScoreVariant4    int
	BestScoreVariant5    int
	AverageScoreVariant  float64
	StrikeoutRateVariant float64
}

func (*Users) GetStats(userID int, variant int) (Stats, error) {
	var stats Stats
	if err := db.QueryRow(
		`
			SELECT
				(
					SELECT COUNT(id)
					FROM game_participants
					WHERE user_id = ?
				) AS num_played,
				(
					SELECT COUNT(games.id)
					FROM games
						JOIN game_participants
							ON game_participants.game_id = games.id
					WHERE game_participants.user_id = ?
						AND games.variant = ?
				) AS num_played_variant,
				(
					SELECT IFNULL(MAX(games.score), 0)
					FROM games
						JOIN game_participants
							ON game_participants.game_id = games.id
					WHERE game_participants.user_id = ?
						AND games.variant = ?
						AND SUBSTRING(games.seed, 2, 1) = "3"
				) AS best_score_variant_3,
				(
					SELECT IFNULL(MAX(games.score), 0)
					FROM games
						JOIN game_participants
							ON game_participants.game_id = games.id
					WHERE game_participants.user_id = ?
						AND games.variant = ?
						AND SUBSTRING(games.seed, 2, 1) = "4"
				) AS best_score_variant_4,
				(
					SELECT IFNULL(MAX(games.score), 0)
					FROM games
						JOIN game_participants
							ON game_participants.game_id = games.id
					WHERE game_participants.user_id = ?
						AND games.variant = ?
						AND SUBSTRING(games.seed, 2, 1) = "5"
				) AS best_score_variant_5,
				(
					SELECT AVG(games.score)
					FROM games
						JOIN game_participants
							ON game_participants.game_id = games.id
					WHERE game_participants.user_id = ?
						AND games.score != 0
						AND games.variant = ?
				) AS average_score_variant,
				(
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
				) AS strikeout_rate_variant
		`,
		userID, // num_played
		userID, // num_played_variant
		variant,
		userID, // best_score_variant_3
		variant,
		userID, // best_score_variant_4
		variant,
		userID, // best_score_variant_5
		variant,
		userID, // average_score_variant
		variant,
		userID, // strikeout_rate_variant
		variant,
		userID,
		variant,
	).Scan(
		&stats.NumPlayed,
		&stats.NumPlayedVariant,
		&stats.BestScoreVariant3,
		&stats.BestScoreVariant4,
		&stats.BestScoreVariant5,
		&stats.AverageScoreVariant,
		&stats.StrikeoutRateVariant,
	); err != nil {
		return stats, err
	}

	return stats, nil
}

func (*Users) Update(userID int, lastIP string) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		UPDATE users
		SET datetime_last_login = NOW(), last_ip = ?
		WHERE id = ?
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	if _, err := stmt.Exec(lastIP, userID); err != nil {
		return err
	}

	return nil
}
