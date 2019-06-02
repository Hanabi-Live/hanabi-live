package models

import (
	"database/sql"
	"encoding/json"
	"strconv"
	"time"
)

type Games struct{}

// GameRow mirrors the "games" table row
// (it contains a subset of the information in the Game struct)
type GameRow struct {
	Name                 string
	NumPlayers           int
	Owner                int
	Variant              int // This corresponds to the numerial ID of the variant listed in the "variants.go" file
	Timed                bool
	TimeBase             int
	TimePerTurn          int
	DeckPlays            bool
	Speedrun             bool
	EmptyClues           bool
	CharacterAssignments bool
	Seed                 string
	Score                int
	NumTurns             int
	EndCondition         int
	DatetimeCreated      time.Time
	DatetimeStarted      time.Time
	DatetimeFinished     time.Time
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
			speedrun,
			deck_plays,
			empty_clues,
			character_assignments,
			seed,
			score,
			num_turns,
			end_condition,
			datetime_created,
			datetime_started,
			datetime_finished
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
		gameRow.Speedrun,
		gameRow.DeckPlays,
		gameRow.EmptyClues,
		gameRow.CharacterAssignments,
		gameRow.Seed,
		gameRow.Score,
		gameRow.NumTurns,
		gameRow.EndCondition,
		gameRow.DatetimeCreated,
		gameRow.DatetimeStarted,
		gameRow.DatetimeFinished,
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
	VariantNum       int
	Variant          string
	DatetimeFinished time.Time
	Seed             string
	NumSimilar       int
	OtherPlayerNames string
	You              bool
}

func (*Games) GetUserHistory(userID int, offset int, amount int, all bool) ([]*GameHistory, error) {
	SQLString := `
		SELECT
			games.id AS id_original,
			games.num_players AS num_players,
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
	if !all {
		SQLString += "LIMIT " + strconv.Itoa(offset) + "," + strconv.Itoa(amount)
	}

	var rows *sql.Rows
	if v, err := db.Query(SQLString, userID, userID); err != nil {
		return nil, err
	} else {
		rows = v
	}
	defer rows.Close()

	games := make([]*GameHistory, 0)
	for rows.Next() {
		var game GameHistory
		if err := rows.Scan(
			&game.ID,
			&game.NumPlayers,
			&game.Score,
			&game.VariantNum,
			&game.DatetimeFinished,
			&game.Seed,
			&game.NumSimilar,
			&game.OtherPlayerNames,
		); err != nil {
			return nil, err
		}
		games = append(games, &game)
	}

	return games, nil
}

func (*Games) GetUserNumGames(userID int) (int, error) {
	var count int
	if err := db.QueryRow(`
		SELECT COUNT(id)
		FROM game_participants
		WHERE user_id = ?
	`, userID).Scan(&count); err != nil {
		return 0, err
	}

	return count, nil
}

// GetNumSimilar is used in the "endGame" function
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

type Options struct {
	Variant              int
	Timed                bool
	BaseTime             int
	TimePerTurn          int
	Speedrun             bool
	DeckPlays            bool
	EmptyClues           bool
	CharacterAssignments bool
}

func (*Games) GetOptions(databaseID int) (Options, error) {
	var options Options
	err := db.QueryRow(`
		SELECT
			variant,
			timed,
			time_base,
			time_per_turn,
			speedrun,
			deck_plays,
			empty_clues,
			character_assignments
		FROM games
		WHERE games.id = ?
	`, databaseID).Scan(
		&options.Variant,
		&options.Timed,
		&options.BaseTime,
		&options.TimePerTurn,
		&options.Speedrun,
		&options.DeckPlays,
		&options.EmptyClues,
		&options.CharacterAssignments,
	)
	return options, err
}

func (*Games) GetNumPlayers(databaseID int) (int, error) {
	var numPlayers int
	err := db.QueryRow(`
		SELECT COUNT(game_participants.id)
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE games.id = ?
	`, databaseID).Scan(&numPlayers)
	return numPlayers, err
}

func (*Games) GetNumTurns(databaseID int) (int, error) {
	var numTurns int
	err := db.QueryRow(`
		SELECT num_turns
		FROM games
		WHERE games.id = ?
	`, databaseID).Scan(&numTurns)
	return numTurns, err
}

func (*Games) GetSeed(databaseID int) (string, error) {
	var seed string
	err := db.QueryRow(`
		SELECT seed
		FROM games
		WHERE games.id = ?
	`, databaseID).Scan(&seed)
	return seed, err
}

type Player struct {
	ID                  int
	Name                string
	CharacterAssignment int
	CharacterMetadata   int
}

// GetPlayers is used in the "hello" and the "commandSharedReplayCreate" commands
func (*Games) GetPlayers(databaseID int) ([]*Player, error) {
	var rows *sql.Rows
	if v, err := db.Query(`
		SELECT
			users.id AS user_id,
			users.username AS username,
			game_participants.character_assignment AS character_assignment,
			game_participants.character_metadata AS character_metadata
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

	players := make([]*Player, 0)
	for rows.Next() {
		var player Player
		if err := rows.Scan(
			&player.ID,
			&player.Name,
			&player.CharacterAssignment,
			&player.CharacterMetadata,
		); err != nil {
			return nil, err
		}
		players = append(players, &player)
	}

	return players, nil
}

type NoteList struct {
	ID    int      `json:"id"`
	Name  string   `json:"name"`
	Notes []string `json:"notes"`
}

// GetNotes is used in the "ready" command
func (*Games) GetNotes(databaseID int) ([]NoteList, error) {
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

	notes := make([]NoteList, 0)
	for rows.Next() {
		// "noteList.Notes" will be an array of all of a player's notes for the game
		var noteList NoteList
		var notesJSON string
		if err := rows.Scan(&noteList.ID, &noteList.Name, &notesJSON); err != nil {
			return nil, err
		}

		// If the notes are longer than the maximum size of the column in the database,
		// then they will be truncated, resulting in invalid JSON
		// So, check to see if it is valid JSON before proceeding
		if !isJSON(notesJSON) {
			notesJSON = "[]"
		}

		// Convert it from JSON to a slice
		if err := json.Unmarshal([]byte(notesJSON), &noteList.Notes); err != nil {
			return nil, err
		}

		notes = append(notes, noteList)
	}

	return notes, nil
}

func (*Games) GetFastestTime(variant int, numPlayers int, perfectScore int) (int, error) {
	var seconds int
	err := db.QueryRow(`
		SELECT TIMESTAMPDIFF(SECOND, datetime_started, datetime_finished) AS datetime_elapsed
		FROM games
		WHERE variant = ?
			AND num_players = ?
			AND score = ?
		ORDER BY datetime_elapsed
		LIMIT 1
	`, variant, numPlayers, perfectScore).Scan(&seconds)
	return seconds, err
}
