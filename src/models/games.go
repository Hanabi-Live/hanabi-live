package models

import (
	"database/sql"
	"encoding/json"
	"time"
)

type Games struct{}

// This mirrors the "games" table row
// (it contains a subset of the information in the Game struct)
type GameRow struct {
	Name            string
	NumPlayers      int
	Owner           int
	Variant         int
	Timed           bool
	TimeBase        int
	TimePerTurn     int
	Seed            string
	Score           int
	EndCondition    int
	DatetimeCreated time.Time
	DatetimeStarted time.Time
}

func (*Games) Insert(gameRow GameRow) (int, error) {
	var stmt *sql.Stmt
	if v, err := db.Prepare(`
		INSERT INTO games (
			name,
			num_players,
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
			?,
			?
		)
	`); err != nil {
		return -1, err
	} else {
		stmt = v
	}
	defer stmt.Close()

	var res sql.Result
	if v, err := stmt.Exec(
		gameRow.Name,
		gameRow.NumPlayers,
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
		return -1, err
	} else {
		res = v
	}

	var id int
	if v, err := res.LastInsertId(); err != nil {
		return -1, err
	} else {
		id = int(v)
	}

	return id, nil
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
	DatetimeFinished time.Time
	Seed             string
	NumSimilar       int
	OtherPlayerNames string
	You              bool
}

func (*Games) GetUserHistory(userID int, limit bool) ([]GameHistory, error) {
	SQLString := `
		SELECT
			games.id AS id_original,
			(
				SELECT COUNT(id)
				FROM game_participants
				WHERE game_id = games.id
			) AS num_players,
			games.score AS score,
			games.variant AS variant,
			datetime_finished,
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
		ORDER BY games.id DESC
	`
	if limit {
		SQLString += "LIMIT 10"
	}

	var rows *sql.Rows
	if v, err := db.Query(SQLString, userID, userID); err != nil {
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
			&game.Seed,
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
func (*Games) GetNumSimilar(seed string) (int, error) {
	var count int
	if err := db.QueryRow(`
		SELECT COUNT(id) AS num_similar
		FROM games
		WHERE seed = ?
	`, seed).Scan(&count); err != nil {
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
	ID   int
	Name string
}

// Used in the "hello" command
func (*Games) GetPlayers(databaseID int) ([]Player, error) {
	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT
			users.id AS user_id,
			users.username AS username
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
			JOIN users ON game_participants.user_id = users.id
		WHERE games.id = ?
			AND datetime_finished IS NOT NULL
		ORDER BY game_participants.id
	`, databaseID); err != nil {
		return nil, err
	} else {
		rows = v
	}
	defer rows.Close()

	players := make([]Player, 0)
	for rows.Next() {
		var player Player
		if err := rows.Scan(&player.ID, &player.Name); err != nil {
			return nil, err
		}
		players = append(players, player)
	}

	return players, nil
}

type PlayerNote struct {
	ID    int
	Name  string
	Notes []string
}

// Used in the "ready" command
func (*Games) GetNotes(databaseID int) ([]PlayerNote, error) {
	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT
			users.id AS id,
			users.username AS name,
			game_participants.notes AS notes
		FROM games
			JOIN game_participants ON game_participants.game_id = games.id
			JOIN users ON users.id = game_participants.user_id
		WHERE games.id = ?
		ORDER BY game_participants.id
	`, databaseID); err != nil {
		return nil, err
	} else {
		rows = v
	}
	defer rows.Close()

	notes := make([]PlayerNote, 0)
	for rows.Next() {
		// Each "note" here is actually a JSON array of all of a player's notes for that game
		var note PlayerNote
		var notesJSON string
		if err := rows.Scan(&note.ID, &note.Name, &notesJSON); err != nil {
			return nil, err
		}

		// If the notes are longer than the maximum size of the column in the database, then they will be truncated, resulting in invalid JSON
		// So, check to see if it is valid JSON before proceeding
		if !isJSON(notesJSON) {
			notesJSON = "[]"
		}

		// Convert it from JSON to a slice
		if err := json.Unmarshal([]byte(notesJSON), &note.Notes); err != nil {
			return nil, err
		}

		notes = append(notes, note)
	}

	return notes, nil
}
