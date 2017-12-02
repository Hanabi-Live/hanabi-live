package models

import "database/sql"

type Games struct{}

// This mirrors the "games" table row
// (it contains a subset of the information in the Game struct)
type GameRow struct {
	Name            string
	Owner           int
	Variant         int
	Timed           bool
	TimeBase        int
	TimePerTurn     int
	Seed            string
	Score           int
	EndCondition    int
	DatetimeCreated int64
	DatetimeStarted int64
}

func (*Games) Insert(gameRow GameRow) error {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO games (
			name,
			owner,
			variant,
			timed,
			time_base,
			time_per_turn,
			seed,
			score,
			end_condition,
			datetime_created,
			datetime_started
		) VALUES (
			?,
			?,
			?,
			?,
			?,
			?,
			?,
			?,
			?,
			?,
			?
		)
	`); err != nil {
		return err
	} else {
		stmt = v
	}
	defer stmt.Close()

	if _, err := stmt.Exec(
		gameRow.Name,
		gameRow.Owner,
		gameRow.Variant,
		gameRow.Timed,
		gameRow.TimeBase,
		gameRow.TimePerTurn,
		gameRow.Seed,
		gameRow.Score,
		gameRow.EndCondition,
		gameRow.DatetimeCreated,
		gameRow.DatetimeStarted,
	); err != nil {
		return err
	}

	return nil
}

func (*Games) Exists(databaseID int) (bool, error) {
	var id int
	if err := db.QueryRow(`
		SELECT id
		FROM games
		WHERE id = ?
	`, databaseID).Scan(&id); err == sql.ErrNoRows {
		return false, nil
	} else if err != nil {
		return false, err
	}

	return true, nil
}

type GameHistory struct {
	ID               int
	NumPlayers       int
	Score            int
	Variant          int
	DatetimeFinished int64
	NumSimilar       int
	OtherPlayerNames string
	You              bool
}

func (*Games) GetUserHistory(userID int) ([]GameHistory, error) {
	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT
			games.id AS id_original,
			(
				SELECT COUNT(id)
				FROM game_participants
				WHERE game_id = games.id
			) AS num_players,
			games.score AS score,
			games.variant AS variant,
			UNIX_TIMESTAMP(datetime_finished),
			games.seed AS seed_original,
			(
				SELECT COUNT(id)
				FROM games
				WHERE seed = seed_original
			) AS num_similar,
			(
				SELECT GROUP_CONCAT(users.username SEPARATOR ', ')
				FROM game_participants
					JOIN users ON users.id = game_participants.user_id
				WHERE game_participants.game_id = id_original
					AND game_participants.user_id != ?
				ORDER BY game_participants.id
			) AS otherPlayerNames
		FROM games
			JOIN game_participants ON game_participants.game_id = games.id
		WHERE game_participants.user_id = ?
		ORDER BY games.id
	`, userID, userID); err != nil {
		return nil, err
	} else {
		rows = v
	}
	defer rows.Close()

	games := make([]GameHistory, 0)
	for rows.Next() {
		var game GameHistory
		if err := rows.Scan(
			&game.ID,
			&game.NumPlayers,
			&game.Score,
			&game.Variant,
			&game.DatetimeFinished,
			&game.NumSimilar,
			&game.OtherPlayerNames,
		); err != nil {
			return nil, err
		}
		games = append(games, game)
	}

	return games, nil
}

// Used in the "endGame" function
func (*Games) GetNumSimilar(databaseID int) (int, error) {
	var count int
	if err := db.QueryRow(`
		SELECT COUNT(id) AS num_similar
		FROM games
		WHERE seed = ?
	`, databaseID).Scan(&count); err != nil {
		return 0, err
	}

	return count, nil
}

func (*Games) GetAllDeals(userID int, databaseID int) ([]GameHistory, error) {
	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT
			id AS id_original,
			score,
			datetime_finished,
			(
				SELECT GROUP_CONCAT(users.username SEPARATOR ', ')
				FROM game_participants
					JOIN users ON users.id = game_participants.user_id
				WHERE game_participants.game_id = id_original
					AND game_participants.user_id != ?
				ORDER BY game_participants.id
			) AS otherPlayerNames,
			(
				SELECT COUNT(game_participants.id)
				FROM game_participants
				WHERE user_id = ?
					AND game_id = games.id
			) AS you
		FROM games
		WHERE seed = (SELECT seed FROM games WHERE id = ?)
		ORDER BY id
	`, userID, userID, databaseID); err != nil {
		return nil, err
	} else {
		rows = v
	}
	defer rows.Close()

	games := make([]GameHistory, 0)
	for rows.Next() {
		var game GameHistory
		if err := rows.Scan(
			&game.ID,
			&game.Score,
			&game.DatetimeFinished,
			&game.OtherPlayerNames,
			&game.You,
		); err != nil {
			return nil, err
		}
		games = append(games, game)
	}

	return games, nil
}

func (*Games) GetPlayerSeeds(userID int) ([]string, error) {
	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT games.seed AS seed
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = ?
	`, userID); err != nil {
		return nil, err
	} else {
		rows = v
	}
	defer rows.Close()

	seeds := make([]string, 0)
	for rows.Next() {
		var seed string
		if err := rows.Scan(&seed); err != nil {
			return nil, err
		}
		seeds = append(seeds, seed)
	}

	return seeds, nil
}

func (*Games) GetVariant(databaseID int) (int, error) {
	var variant int
	if err := db.QueryRow(`
		SELECT
			variant
		FROM games
		WHERE games.id = ?
	`, databaseID).Scan(&variant); err != nil {
		return variant, err
	}

	return variant, nil
}

type Player struct {
	ID       int
	Username string
}

func (*Games) GetPlayers(databaseID int) ([]Player, error) {
	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT
			games.variant AS variant,
			users.id AS user_id,
			users.username AS username
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
			JOIN users ON game_participants.user_id = users.id
		WHERE games.id = ?
			AND datetime_finished IS NOT NULL
		ORDER BY game_participants.id	`, userID); err != nil {
		return nil, err
	} else {
		rows = v
	}
	defer rows.Close()

	seeds := make([]string, 0)
	for rows.Next() {
		var seed string
		if err := rows.Scan(&seed); err != nil {
			return nil, err
		}
		seeds = append(seeds, seed)
	}

	return seeds, nil
}
