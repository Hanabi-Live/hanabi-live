package main

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
	Speedrun             bool
	CardCycle            bool
	DeckPlays            bool
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
			card_cycle,
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
		gameRow.CardCycle,
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
	OtherPlayerNames string
	You              bool
	DatetimeFinished time.Time
	Seed             string
	NumSimilar       int
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
				ORDER BY game_participants.seat
			) AS otherPlayerNames
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = ?
		ORDER BY games.id DESC
	`
	if !all {
		SQLString += "LIMIT " + strconv.Itoa(offset) + "," + strconv.Itoa(amount)
	}

	rows, err := db.Query(SQLString, userID, userID)

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

	if rows.Err() != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	return games, nil
}

func (*Games) GetVariantHistory(variant int, amount int) ([]*GameHistory, error) {
	rows, err := db.Query(`
		SELECT
			id AS id_original,
			num_players,
			score,
			variant,
			(
				SELECT GROUP_CONCAT(users.username SEPARATOR ', ')
				FROM game_participants
					JOIN users ON users.id = game_participants.user_id
				WHERE game_participants.game_id = id_original
				ORDER BY game_participants.seat
			) AS playerNames,
			datetime_finished
		FROM games
		WHERE variant = ?
		ORDER BY games.id DESC
		LIMIT ?
	`, variant, amount)

	games := make([]*GameHistory, 0)
	for rows.Next() {
		var game GameHistory
		if err := rows.Scan(
			&game.ID,
			&game.NumPlayers,
			&game.Score,
			&game.VariantNum,
			&game.OtherPlayerNames,
			&game.DatetimeFinished,
		); err != nil {
			return nil, err
		}
		games = append(games, &game)
	}

	if rows.Err() != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	return games, nil
}

func (*Games) GetUserNumGames(userID int, includeSpeedrun bool) (int, error) {
	SQLString := `
		SELECT COUNT(games.id)
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = ?
	`
	if !includeSpeedrun {
		SQLString += "AND games.speedrun = 0"
	}
	var count int
	if err := db.QueryRow(SQLString, userID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

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

func (*Games) GetAllDeals(userID int, databaseID int) ([]*GameHistory, error) {
	rows, err := db.Query(`
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
				ORDER BY game_participants.seat
			) AS otherPlayerNames,
			(
				SELECT COUNT(game_participants.game_id)
				FROM game_participants
				WHERE user_id = ?
					AND game_id = games.id
			) AS you
		FROM games
		WHERE seed = (SELECT seed FROM games WHERE id = ?)
		ORDER BY id
	`, userID, userID, databaseID)

	games := make([]*GameHistory, 0)
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
		games = append(games, &game)
	}

	if rows.Err() != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	return games, nil
}

func (*Games) GetPlayerSeeds(userID int) ([]string, error) {
	rows, err := db.Query(`
		SELECT games.seed AS seed
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = ?
	`, userID)

	seeds := make([]string, 0)
	for rows.Next() {
		var seed string
		if err := rows.Scan(&seed); err != nil {
			return nil, err
		}
		seeds = append(seeds, seed)
	}

	if rows.Err() != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	return seeds, nil
}

type DBOptions struct {
	Variant              int
	Timed                bool
	BaseTime             int
	TimePerTurn          int
	Speedrun             bool
	CardCycle            bool
	DeckPlays            bool
	EmptyClues           bool
	CharacterAssignments bool
}

func (*Games) GetOptions(databaseID int) (DBOptions, error) {
	var options DBOptions
	err := db.QueryRow(`
		SELECT
			variant,
			timed,
			time_base,
			time_per_turn,
			speedrun,
			card_cycle,
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
		&options.CardCycle,
		&options.DeckPlays,
		&options.EmptyClues,
		&options.CharacterAssignments,
	)
	return options, err
}

func (*Games) GetNumPlayers(databaseID int) (int, error) {
	var numPlayers int
	err := db.QueryRow(`
		SELECT COUNT(game_participants.game_id)
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

type DBPlayer struct {
	ID                  int
	Name                string
	CharacterAssignment int
	CharacterMetadata   int
}

func (*Games) GetPlayers(databaseID int) ([]*DBPlayer, error) {
	rows, err := db.Query(`
		SELECT
			users.id AS user_id,
			users.username AS username,
			game_participants.character_assignment AS character_assignment,
			game_participants.character_metadata AS character_metadata
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
			JOIN users ON game_participants.user_id = users.id
		WHERE games.id = ?
		ORDER BY game_participants.seat
	`, databaseID)

	players := make([]*DBPlayer, 0)
	for rows.Next() {
		var player DBPlayer
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

	if rows.Err() != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	return players, nil
}

type NoteList struct {
	ID    int      `json:"id"`
	Name  string   `json:"name"`
	Notes []string `json:"notes"`
}

func (*Games) GetNotes(databaseID int) ([]NoteList, error) {
	rows, err := db.Query(`
		SELECT
			users.id AS id,
			users.username AS name,
			game_participants.notes AS notes
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
			JOIN users ON users.id = game_participants.user_id
		WHERE games.id = ?
		ORDER BY game_participants.seat
	`, databaseID)

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

	if rows.Err() != nil {
		return nil, err
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}

	return notes, nil
}

func (*Games) GetFastestTime(variant int, numPlayers int, maxScore int) (int, error) {
	var seconds int
	err := db.QueryRow(`
		SELECT TIMESTAMPDIFF(SECOND, datetime_started, datetime_finished) AS datetime_elapsed
		FROM games
		WHERE variant = ?
			AND num_players = ?
			AND score = ?
		ORDER BY datetime_elapsed
		LIMIT 1
	`, variant, numPlayers, maxScore).Scan(&seconds)
	return seconds, err
}

type Stats struct {
	NumGames           int
	TimePlayed         sql.NullString
	NumGamesSpeedrun   int
	TimePlayedSpeedrun sql.NullString
}

func (*Games) GetProfileStats(userID int) (Stats, error) {
	var stats Stats

	if err := db.QueryRow(`
		SELECT
			(
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = ?
					AND games.speedrun = 0
			) AS num_games,
			(
				SELECT SUM(TIMESTAMPDIFF(SECOND, datetime_started, datetime_finished))
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = ?
					AND games.speedrun = 0
			) AS timed_played,
			(
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = ?
					AND games.speedrun = 1
			) AS num_games_speedrun,
			(
				SELECT SUM(TIMESTAMPDIFF(SECOND, datetime_started, datetime_finished))
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = ?
					AND games.speedrun = 1
			) AS time_played_speedrun
	`, userID, userID, userID, userID).Scan(
		&stats.NumGames,
		&stats.TimePlayed,
		&stats.NumGamesSpeedrun,
		&stats.TimePlayedSpeedrun,
	); err != nil {
		return stats, err
	}

	return stats, nil
}

func (*Games) GetGlobalStats() (Stats, error) {
	var stats Stats

	if err := db.QueryRow(`
		SELECT
			(
				SELECT COUNT(id)
				FROM games
				WHERE games.speedrun = 0
			) AS num_games,
			(
				SELECT SUM(TIMESTAMPDIFF(SECOND, datetime_started, datetime_finished))
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE games.speedrun = 0
			) AS timed_played,
			(
				SELECT COUNT(id)
				FROM games
				WHERE games.speedrun = 1
			) AS num_games_speedrun,
			(
				SELECT SUM(TIMESTAMPDIFF(SECOND, datetime_started, datetime_finished))
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE games.speedrun = 1
			) AS time_played_speedrun
	`).Scan(
		&stats.NumGames,
		&stats.TimePlayed,
		&stats.NumGamesSpeedrun,
		&stats.TimePlayedSpeedrun,
	); err != nil {
		return stats, err
	}

	return stats, nil
}

func (*Games) GetVariantStats(variant int) (Stats, error) {
	var stats Stats

	if err := db.QueryRow(`
		SELECT
			(
				SELECT COUNT(id)
				FROM games
				WHERE variant = ?
					AND games.speedrun = 0
			) AS num_games,
			(
				SELECT SUM(TIMESTAMPDIFF(SECOND, datetime_started, datetime_finished))
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE variant = ?
					AND games.speedrun = 0
			) AS timed_played,
			(
				SELECT COUNT(id)
				FROM games
				WHERE variant = ?
					AND games.speedrun = 1
			) AS num_games_speedrun,
			(
				SELECT SUM(TIMESTAMPDIFF(SECOND, datetime_started, datetime_finished))
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE variant = ?
					AND games.speedrun = 1
			) AS time_played_speedrun
	`, variant, variant, variant, variant).Scan(
		&stats.NumGames,
		&stats.TimePlayed,
		&stats.NumGamesSpeedrun,
		&stats.TimePlayedSpeedrun,
	); err != nil {
		return stats, err
	}

	return stats, nil
}
