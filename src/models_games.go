package main

import (
	"context"
	"database/sql"
	"strconv"
	"time"

	"github.com/jackc/pgx/v4"
)

type Games struct{}

// GameRow mirrors the "games" table row
// (it contains a subset of the information in the Game struct)
type GameRow struct {
	Name       string
	NumPlayers int
	Owner      int
	// This corresponds to the numerial ID of the variant listed in the "variants.go" file
	Variant              int
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
	// https://www.postgresql.org/docs/9.5/dml-returning.html
	// https://github.com/jackc/pgx/issues/411
	var id int
	if err := db.QueryRow(
		context.Background(),
		`
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
				$1,
				$2,
				$3,
				$4,
				$5,
				$6,
				$7,
				$8,
				$9,
				$10,
				$11,
				$12,
				$13,
				$14,
				$15,
				$16,
				$17,
				$18,
				$19
			)
			RETURNING id
		`,
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
	).Scan(&id); err != nil {
		return -1, err
	}

	return id, nil
}

func (*Games) Exists(databaseID int) (bool, error) {
	var id int
	if err := db.QueryRow(context.Background(), `
		SELECT id
		FROM games
		WHERE id = $1
	`, databaseID).Scan(&id); err == pgx.ErrNoRows {
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
			games1.id,
			games1.num_players,
			games1.score,
			games1.variant,
			games1.datetime_finished,
			games1.seed,
			(
				SELECT COUNT(games2.id)
				FROM games AS games2
				WHERE games2.seed = games1.seed
			) AS num_similar,
			(
				/* The "ORDER BY" part must be inside of the "STRING_AGG" function */
				SELECT STRING_AGG(users.username, ', ' ORDER BY game_participants2.seat)
				FROM game_participants AS game_participants2
					JOIN users ON users.id = game_participants2.user_id
				WHERE game_participants2.game_id = games1.id
					AND game_participants2.user_id != $1
			) AS other_player_names
		FROM games AS games1
			JOIN game_participants AS game_participants1 ON games1.id = game_participants1.game_id
		WHERE game_participants1.user_id = $2
		ORDER BY games1.id DESC
	`
	if !all {
		SQLString += "LIMIT " + strconv.Itoa(amount) + " OFFSET " + strconv.Itoa(offset)
	}

	rows, err := db.Query(context.Background(), SQLString, userID, userID)

	games := make([]*GameHistory, 0)
	for rows.Next() {
		var game GameHistory
		if err2 := rows.Scan(
			&game.ID,
			&game.NumPlayers,
			&game.Score,
			&game.VariantNum,
			&game.DatetimeFinished,
			&game.Seed,
			&game.NumSimilar,
			&game.OtherPlayerNames,
		); err2 != nil {
			return nil, err2
		}
		games = append(games, &game)
	}

	if rows.Err() != nil {
		return nil, err
	}
	rows.Close()

	return games, nil
}

func (*Games) GetVariantHistory(variant int, amount int) ([]*GameHistory, error) {
	rows, err := db.Query(context.Background(), `
		SELECT
			games.id,
			games.num_players,
			games.score,
			games.variant,
			(
				/* The "ORDER BY" part must be inside of the "STRING_AGG" function */
				SELECT STRING_AGG(users.username, ', ' ORDER BY game_participants.seat)
				FROM game_participants
					JOIN users ON users.id = game_participants.user_id
				WHERE game_participants.game_id = games.id
			) AS player_names
			datetime_finished
		FROM games
		WHERE variant = $1
		ORDER BY games.id DESC
		LIMIT $2
	`, variant, amount)

	games := make([]*GameHistory, 0)
	for rows.Next() {
		var game GameHistory
		if err2 := rows.Scan(
			&game.ID,
			&game.NumPlayers,
			&game.Score,
			&game.VariantNum,
			&game.OtherPlayerNames,
			&game.DatetimeFinished,
		); err2 != nil {
			return nil, err2
		}
		games = append(games, &game)
	}

	if rows.Err() != nil {
		return nil, err
	}
	rows.Close()

	return games, nil
}

func (*Games) GetUserNumGames(userID int, includeSpeedrun bool) (int, error) {
	SQLString := `
		SELECT COUNT(games.id)
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = $1
	`
	if !includeSpeedrun {
		SQLString += "AND games.speedrun = FALSE"
	}
	var count int
	if err := db.QueryRow(context.Background(), SQLString, userID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (*Games) GetNumSimilar(seed string) (int, error) {
	var count int
	if err := db.QueryRow(context.Background(), `
		SELECT COUNT(id) AS num_similar
		FROM games
		WHERE seed = $1
	`, seed).Scan(&count); err != nil {
		return 0, err
	}

	return count, nil
}

func (*Games) GetAllDeals(userID int, databaseID int) ([]*GameHistory, error) {
	rows, err := db.Query(context.Background(), `
		SELECT
			games.id,
			games.score,
			games.datetime_finished,
			(
				/* The "ORDER BY" part must be inside of the "STRING_AGG" function */
				SELECT STRING_AGG(users.username, ', ' ORDER BY game_participants.seat)
				FROM game_participants
					JOIN users ON users.id = game_participants.user_id
				WHERE game_participants.game_id = games.id
					AND game_participants.user_id != $1
			) AS other_player_names,
			(
				SELECT COUNT(game_participants.game_id)
				FROM game_participants
				WHERE user_id = $2
					AND game_id = games.id
			) AS you
		FROM games
		WHERE seed = (SELECT seed FROM games WHERE id = $3)
		ORDER BY id
	`, userID, userID, databaseID)

	games := make([]*GameHistory, 0)
	for rows.Next() {
		var game GameHistory
		if err2 := rows.Scan(
			&game.ID,
			&game.Score,
			&game.DatetimeFinished,
			&game.OtherPlayerNames,
			&game.You,
		); err2 != nil {
			return nil, err2
		}
		games = append(games, &game)
	}

	if rows.Err() != nil {
		return nil, err
	}
	rows.Close()

	return games, nil
}

type DBOptions struct {
	StartingPlayer       int // Legacy field for games prior to April 2020
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
	err := db.QueryRow(context.Background(), `
		SELECT
			starting_player,
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
		WHERE games.id = $1
	`, databaseID).Scan(
		&options.StartingPlayer,
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
	err := db.QueryRow(context.Background(), `
		SELECT COUNT(game_participants.game_id)
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE games.id = $1
	`, databaseID).Scan(&numPlayers)
	return numPlayers, err
}

func (*Games) GetNumTurns(databaseID int) (int, error) {
	var numTurns int
	err := db.QueryRow(context.Background(), `
		SELECT num_turns
		FROM games
		WHERE games.id = $1
	`, databaseID).Scan(&numTurns)
	return numTurns, err
}

func (*Games) GetSeed(databaseID int) (string, error) {
	var seed string
	err := db.QueryRow(context.Background(), `
		SELECT seed
		FROM games
		WHERE games.id = $1
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
	rows, err := db.Query(context.Background(), `
		SELECT
			users.id AS user_id,
			users.username AS username,
			game_participants.character_assignment AS character_assignment,
			game_participants.character_metadata AS character_metadata
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
			JOIN users ON game_participants.user_id = users.id
		WHERE games.id = $1
		ORDER BY game_participants.seat
	`, databaseID)

	players := make([]*DBPlayer, 0)
	for rows.Next() {
		var player DBPlayer
		if err2 := rows.Scan(
			&player.ID,
			&player.Name,
			&player.CharacterAssignment,
			&player.CharacterMetadata,
		); err2 != nil {
			return nil, err2
		}
		players = append(players, &player)
	}

	if rows.Err() != nil {
		return nil, err
	}
	rows.Close()

	return players, nil
}

func (*Games) GetPlayerNames(databaseID int) ([]string, error) {
	rows, err := db.Query(context.Background(), `
		SELECT
			users.username AS username
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
			JOIN users ON game_participants.user_id = users.id
		WHERE games.id = $1
		ORDER BY game_participants.seat
	`, databaseID)

	playerNames := make([]string, 0)
	for rows.Next() {
		var playerName string
		if err2 := rows.Scan(
			&playerName,
		); err2 != nil {
			return nil, err2
		}
		playerNames = append(playerNames, playerName)
	}

	if rows.Err() != nil {
		return nil, err
	}
	rows.Close()

	return playerNames, nil
}

func (*Games) GetPlayerSeeds(userID int) ([]string, error) {
	// We want to use "DISCTINCT" since it is possible for a player to play on the same seed twice
	// with the "!seed" feature or the "!replay" feature
	rows, err := db.Query(context.Background(), `
		SELECT DISTINCT games.seed AS seed
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = $1
		ORDER BY seed
	`, userID)

	seeds := make([]string, 0)
	for rows.Next() {
		var seed string
		if err2 := rows.Scan(&seed); err2 != nil {
			return nil, err2
		}
		seeds = append(seeds, seed)
	}

	if rows.Err() != nil {
		return nil, err
	}
	rows.Close()

	return seeds, nil
}

func (*Games) GetNotes(databaseID int, numPlayers int, noteSize int) ([][]string, error) {
	// nolint:lll
	rows, err := db.Query(context.Background(), `
		SELECT
			game_participants.seat AS seat,
			game_participant_notes.card_order AS card_order,
			game_participant_notes.note AS note
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
			JOIN game_participant_notes ON game_participants.id = game_participant_notes.game_participant_id
		WHERE games.id = $1
		ORDER BY game_participants.seat, game_participant_notes.card_order
	`, databaseID)

	// These rows contain the notes for all of the players in the game, one row for each note
	allPlayersNotes := make([][]string, numPlayers)
	for i := 0; i < numPlayers; i++ {
		allPlayersNotes[i] = make([]string, noteSize)
	}
	for rows.Next() {
		var seat int
		var order int
		var note string
		if err2 := rows.Scan(&seat, &order, &note); err2 != nil {
			return nil, err2
		}

		allPlayersNotes[seat][order] = note
	}

	if rows.Err() != nil {
		return nil, err
	}
	rows.Close()

	return allPlayersNotes, nil
}

func (*Games) GetFastestTime(variant int, numPlayers int, maxScore int) (int, error) {
	var seconds int
	if err := db.QueryRow(context.Background(), `
		SELECT
			(
				EXTRACT(EPOCH FROM datetime_finished) -
				EXTRACT(EPOCH FROM datetime_started)
			) AS datetime_elapsed
		FROM games
		WHERE variant = $1
			AND num_players = $2
			AND score = $3
		ORDER BY datetime_elapsed
		LIMIT 1
	`, variant, numPlayers, maxScore).Scan(&seconds); err == pgx.ErrNoRows {
		return 10 * 60, nil // Default to 10 minutes
	} else if err != nil {
		return seconds, err
	}

	return seconds, nil
}

type Stats struct {
	DateJoined         time.Time
	NumGames           int
	TimePlayed         sql.NullString
	NumGamesSpeedrun   int
	TimePlayedSpeedrun sql.NullString
}

func (*Games) GetProfileStats(userID int) (Stats, error) {
	var stats Stats

	if err := db.QueryRow(context.Background(), `
		SELECT
			(
				SELECT datetime_created
				FROM users
				WHERE id = $1
			) AS date_joined,
			(
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = $2
					AND games.speedrun = FALSE
			) AS num_games,
			(
				SELECT SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = $3
					AND games.speedrun = FALSE
			) AS timed_played,
			(
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = $4
					AND games.speedrun = TRUE
			) AS num_games_speedrun,
			(
				SELECT SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = $5
					AND games.speedrun = TRUE
			) AS time_played_speedrun
	`, userID, userID, userID, userID, userID).Scan(
		&stats.DateJoined,
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

	if err := db.QueryRow(context.Background(), `
		SELECT
			(
				SELECT COUNT(id)
				FROM games
				WHERE games.speedrun = FALSE
			) AS num_games,
			(
				SELECT SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE games.speedrun = FALSE
			) AS timed_played,
			(
				SELECT COUNT(id)
				FROM games
				WHERE games.speedrun = TRUE
			) AS num_games_speedrun,
			(
				SELECT SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE games.speedrun = TRUE
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

	if err := db.QueryRow(context.Background(), `
		SELECT
			(
				SELECT COUNT(id)
				FROM games
				WHERE variant = $1
					AND games.speedrun = FALSE
			) AS num_games,
			(
				SELECT SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE variant = $2
					AND games.speedrun = FALSE
			) AS timed_played,
			(
				SELECT COUNT(id)
				FROM games
				WHERE variant = $3
					AND games.speedrun = TRUE
			) AS num_games_speedrun,
			(
				SELECT SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE variant = $4
					AND games.speedrun = TRUE
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
