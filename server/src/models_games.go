package main

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v4"
)

type Games struct{}

// GameRow roughly mirrors the "games" table row
// (it contains a subset of the information in the Game struct)
type GameRow struct {
	Name             string
	Options          *Options
	Seed             string
	Score            int
	NumTurns         int
	EndCondition     int
	DatetimeStarted  time.Time
	DatetimeFinished time.Time
}

func (*Games) Insert(gameRow GameRow) (int, error) {
	// Local variables
	variant := variants[gameRow.Options.VariantName]

	// https://www.postgresql.org/docs/9.5/dml-returning.html
	// https://github.com/jackc/pgx/issues/411
	var id int
	if err := db.QueryRow(
		context.Background(),
		`
			INSERT INTO games (
				name,
				num_players,
				variant_id,
				timed,
				time_base,
				time_per_turn,
				speedrun,
				card_cycle,
				deck_plays,
				empty_clues,
				one_extra_card,
				one_less_card,
				all_or_nothing,
				detrimental_characters,
				seed,
				score,
				num_turns,
				end_condition,
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
				$19,
				$20
			)
			RETURNING id
		`,
		gameRow.Name,
		gameRow.Options.NumPlayers,
		// In the Options struct, the variant is stored as a string,
		// but it needs to be stored in the database as an integer
		variant.ID,
		gameRow.Options.Timed,
		gameRow.Options.TimeBase,
		gameRow.Options.TimePerTurn,
		gameRow.Options.Speedrun,
		gameRow.Options.CardCycle,
		gameRow.Options.DeckPlays,
		gameRow.Options.EmptyClues,
		gameRow.Options.OneExtraCard,
		gameRow.Options.OneLessCard,
		gameRow.Options.AllOrNothing,
		gameRow.Options.DetrimentalCharacters,
		gameRow.Seed,
		gameRow.Score,
		gameRow.NumTurns,
		gameRow.EndCondition,
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
	ID                 int       `json:"id"`
	Options            *Options  `json:"options"`
	Seed               string    `json:"seed"`
	Score              int       `json:"score"`
	NumTurns           int       `json:"numTurns"`
	EndCondition       int       `json:"endCondition"`
	DatetimeStarted    time.Time `json:"datetimeStarted"`
	DatetimeFinished   time.Time `json:"datetimeFinished"`
	NumGamesOnThisSeed int       `json:"numGamesOnThisSeed"`
	PlayerNames        []string  `json:"playerNames"`
	IncrementNumGames  bool      `json:"incrementNumGames"`
	Tags               string    `json:"tags"`
}

func (g *Games) GetHistory(gameIDs []int) ([]*GameHistory, error) {
	return g.GetHistoryCustomSort(gameIDs, "id DESC")
}

func (*Games) GetHistoryCustomSort(gameIDs []int, sort string) ([]*GameHistory, error) {
	games := make([]*GameHistory, 0)

	// We rename "games" to "games1" so that the subquery can access their values
	// (otherwise, the table names would conflict)
	SQLString := `
		SELECT
			games1.id,
			games1.num_players,
			games1.variant_id,
			games1.timed,
			games1.time_base,
			games1.time_per_turn,
			games1.speedrun,
			games1.card_cycle,
			games1.deck_plays,
			games1.empty_clues,
			games1.one_extra_card,
			games1.one_less_card,
			games1.all_or_nothing,
			games1.detrimental_characters,
			games1.seed,
			games1.score,
			games1.num_turns,
			games1.end_condition,
			games1.datetime_started,
			games1.datetime_finished,
			(
				/*
				 * We use a "COALESCE" to return 0 if the corresponding row in the "seeds" table
				 * does not exist
				 * This row should always exist, but check it just to be safe
				 */
				SELECT COALESCE((
					SELECT seeds.num_games
					FROM seeds
					WHERE seeds.seed = games1.seed
				), 0)
			) AS num_games_on_this_seed,
			(
				SELECT STRING_AGG(users.username, ', ')
				FROM game_participants
					JOIN users ON users.id = game_participants.user_id
				WHERE game_participants.game_id = games1.id
			) AS player_names
		FROM games AS games1
		/*
		 * We must use the ANY operator for matching an array of IDs:
		 * https://github.com/jackc/pgx/issues/334
		 */
		WHERE games1.id = ANY($1)
	`
	SQLString += "ORDER BY games1." + sort

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), SQLString, gameIDs); err != nil {
		return games, err
	} else {
		rows = v
	}

	for rows.Next() {
		gameHistory := GameHistory{
			Options: &Options{},
		}
		var variantID int
		var playerNamesString string
		if err := rows.Scan(
			&gameHistory.ID,
			&gameHistory.Options.NumPlayers,
			&variantID,
			&gameHistory.Options.Timed,
			&gameHistory.Options.TimeBase,
			&gameHistory.Options.TimePerTurn,
			&gameHistory.Options.Speedrun,
			&gameHistory.Options.CardCycle,
			&gameHistory.Options.DeckPlays,
			&gameHistory.Options.EmptyClues,
			&gameHistory.Options.OneExtraCard,
			&gameHistory.Options.OneLessCard,
			&gameHistory.Options.AllOrNothing,
			&gameHistory.Options.DetrimentalCharacters,
			&gameHistory.Seed,
			&gameHistory.Score,
			&gameHistory.NumTurns,
			&gameHistory.EndCondition,
			&gameHistory.DatetimeStarted,
			&gameHistory.DatetimeFinished,
			&gameHistory.NumGamesOnThisSeed,
			&playerNamesString,
		); err != nil {
			return games, err
		}

		// Get the name of the variant that corresponds to the variant ID
		if variantName, ok := variantIDMap[variantID]; !ok {
			err := errors.New("the variant ID of " + strconv.Itoa(variantID) + " is not valid")
			return games, err
		} else {
			gameHistory.Options.VariantName = variantName
		}

		// The players come from the database in a random order
		// (since we did not include an "ORDER BY" keyword)
		// Alphabetize the players (case-insensitive)
		playerNames := strings.Split(playerNamesString, ", ")
		playerNames = sortStringsCaseInsensitive(playerNames)
		gameHistory.PlayerNames = playerNames

		games = append(games, &gameHistory)
	}

	if err := rows.Err(); err != nil {
		return games, err
	}
	rows.Close()

	return games, nil
}

func (*Games) GetGameIDsUser(userID int, offset int, amount int) ([]int, error) {
	gameIDs := make([]int, 0)

	SQLString := `
		SELECT games.id
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = $1
		/* We must get the results in decending order for the limit to work properly */
		ORDER BY games.id DESC
	`
	if amount > 0 {
		SQLString += "LIMIT $2 OFFSET $3"
	}

	var rows pgx.Rows
	if amount > 0 {
		if v, err := db.Query(context.Background(), SQLString, userID, amount, offset); err != nil {
			return gameIDs, err
		} else {
			rows = v
		}
	} else {
		if v, err := db.Query(context.Background(), SQLString, userID); err != nil {
			return gameIDs, err
		} else {
			rows = v
		}
	}

	for rows.Next() {
		var gameID int
		if err := rows.Scan(&gameID); err != nil {
			return gameIDs, err
		}
		gameIDs = append(gameIDs, gameID)
	}

	if err := rows.Err(); err != nil {
		return gameIDs, err
	}
	rows.Close()

	return gameIDs, nil
}

func (*Games) GetGameIDsSeed(seed string) ([]int, error) {
	gameIDs := make([]int, 0)

	SQLString := `
		SELECT id
		FROM games
		WHERE seed = $1
	`

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), SQLString, seed); err != nil {
		return gameIDs, err
	} else {
		rows = v
	}

	for rows.Next() {
		var gameID int
		if err := rows.Scan(&gameID); err != nil {
			return gameIDs, err
		}
		gameIDs = append(gameIDs, gameID)
	}

	if err := rows.Err(); err != nil {
		return gameIDs, err
	}
	rows.Close()

	return gameIDs, nil
}

func (*Games) GetGameIDsFriends(
	userID int,
	friends map[int]struct{},
	offset int,
	amount int,
) ([]int, error) {
	gameIDs := make([]int, 0)

	friendIDs := make([]int, 0)
	for friendID := range friends {
		friendIDs = append(friendIDs, friendID)
	}

	SQLString := `
		SELECT DISTINCT games.id
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		/*
		 * We must use the ANY operator for matching an array of IDs:
		 * https://github.com/jackc/pgx/issues/334
		 */
		WHERE game_participants.user_id = ANY($1)
		EXCEPT
		SELECT games.id
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = $2
		/* We must get the results in decending order for the limit to work properly */
		ORDER BY id DESC
		LIMIT $3 OFFSET $4
	`

	var rows pgx.Rows
	if v, err := db.Query(
		context.Background(),
		SQLString,
		friendIDs,
		userID,
		amount,
		offset,
	); err != nil {
		return gameIDs, err
	} else {
		rows = v
	}

	for rows.Next() {
		var gameID int
		if err := rows.Scan(&gameID); err != nil {
			return gameIDs, err
		}
		gameIDs = append(gameIDs, gameID)
	}

	if err := rows.Err(); err != nil {
		return gameIDs, err
	}
	rows.Close()

	return gameIDs, nil
}

func (*Games) GetGameIDsMultiUser(userIDs []int) ([]int, error) {
	gameIDs := make([]int, 0)

	SQLString := `
		SELECT DISTINCT games.id
		FROM games
	`
	for _, id := range userIDs {
		SQLString += "JOIN game_participants AS player" + strconv.Itoa(id) + "_games "
		SQLString += "ON games.id = player" + strconv.Itoa(id) + "_games.game_id "
		SQLString += "AND player" + strconv.Itoa(id) + "_games.user_id = " + strconv.Itoa(id) + " "
	}

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), SQLString); err != nil {
		return gameIDs, err
	} else {
		rows = v
	}

	for rows.Next() {
		var gameID int
		if err := rows.Scan(&gameID); err != nil {
			return gameIDs, err
		}
		gameIDs = append(gameIDs, gameID)
	}

	if err := rows.Err(); err != nil {
		return gameIDs, err
	}
	rows.Close()

	return gameIDs, nil
}

func (*Games) GetGameIDsVariant(variantID int, amount int) ([]int, error) {
	gameIDs := make([]int, 0)

	SQLString := `
		SELECT id
		FROM games
		WHERE variant_id = $1
		/* We must get the results in decending order for the limit to work properly */
		ORDER BY id DESC
		LIMIT $2
	`

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), SQLString, variantID, amount); err != nil {
		return gameIDs, err
	} else {
		rows = v
	}

	for rows.Next() {
		var gameID int
		if err := rows.Scan(&gameID); err != nil {
			return gameIDs, err
		}
		gameIDs = append(gameIDs, gameID)
	}

	if err := rows.Err(); err != nil {
		return gameIDs, err
	}
	rows.Close()

	return gameIDs, nil
}

func (*Games) GetGameIDsPastX(amount int) ([]int, error) {
	gameIDs := make([]int, 0)

	SQLString := `
		SELECT id
		FROM games
		/* We must get the results in decending order for the limit to work properly */
		ORDER BY id DESC
		LIMIT $1
	`

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), SQLString, amount); err != nil {
		return gameIDs, err
	} else {
		rows = v
	}

	for rows.Next() {
		var gameID int
		if err := rows.Scan(&gameID); err != nil {
			return gameIDs, err
		}
		gameIDs = append(gameIDs, gameID)
	}

	if err := rows.Err(); err != nil {
		return gameIDs, err
	}
	rows.Close()

	return gameIDs, nil
}

func (*Games) GetGameIDsSinceDatetime(datetime string) ([]int, error) {
	gameIDs := make([]int, 0)

	SQLString := `
		SELECT id
		FROM games
		/* We must get the results in decending order for the limit to work properly */
		ORDER BY id DESC
		WHERE datetime_started > $1
	`

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), SQLString, datetime); err != nil {
		return gameIDs, err
	} else {
		rows = v
	}

	for rows.Next() {
		var gameID int
		if err := rows.Scan(&gameID); err != nil {
			return gameIDs, err
		}
		gameIDs = append(gameIDs, gameID)
	}

	if err := rows.Err(); err != nil {
		return gameIDs, err
	}
	rows.Close()

	return gameIDs, nil
}

func (*Games) GetGameIDsSinceInterval(interval string) ([]int, error) {
	gameIDs := make([]int, 0)

	SQLString := `
		SELECT id
		FROM games
		WHERE datetime_started > NOW() - INTERVAL
	`
	SQLString += "'" + interval + "'" // We can't use $1 for intervals for some reason

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), SQLString); err != nil {
		return gameIDs, err
	} else {
		rows = v
	}

	for rows.Next() {
		var gameID int
		if err := rows.Scan(&gameID); err != nil {
			return gameIDs, err
		}
		gameIDs = append(gameIDs, gameID)
	}

	if err := rows.Err(); err != nil {
		return gameIDs, err
	}
	rows.Close()

	return gameIDs, nil
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

func (*Games) GetOptions(databaseID int) (*Options, error) {
	var options Options
	var variantID int
	if err := db.QueryRow(context.Background(), `
		SELECT
			num_players,
			starting_player,
			variant_id,
			timed,
			time_base,
			time_per_turn,
			speedrun,
			card_cycle,
			deck_plays,
			empty_clues,
			one_extra_card,
			one_less_card,
			all_or_nothing,
			detrimental_characters
		FROM games
		WHERE games.id = $1
	`, databaseID).Scan(
		&options.NumPlayers,
		&options.StartingPlayer,
		&variantID,
		&options.Timed,
		&options.TimeBase,
		&options.TimePerTurn,
		&options.Speedrun,
		&options.CardCycle,
		&options.DeckPlays,
		&options.EmptyClues,
		&options.OneExtraCard,
		&options.OneLessCard,
		&options.AllOrNothing,
		&options.DetrimentalCharacters,
	); err != nil {
		return &options, err
	}

	// Validate that the variant exists
	if v, ok := variantIDMap[variantID]; !ok {
		err := errors.New("failed to find a definition for variant " + strconv.Itoa(variantID))
		return &options, err
	} else {
		options.VariantName = v
	}

	return &options, nil
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

func (*Games) GetDatetimes(databaseID int) (time.Time, time.Time, error) {
	var datetimeStarted time.Time
	var datetimeFinished time.Time
	err := db.QueryRow(context.Background(), `
		SELECT datetime_started, datetime_finished
		FROM games
		WHERE games.id = $1
	`, databaseID).Scan(&datetimeStarted, &datetimeFinished)
	return datetimeStarted, datetimeFinished, err
}

type DBPlayer struct {
	ID                  int
	Name                string
	CharacterAssignment int
	CharacterMetadata   int
}

func (*Games) GetPlayers(databaseID int) ([]*DBPlayer, error) {
	players := make([]*DBPlayer, 0)

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
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
	`, databaseID); err != nil {
		return players, err
	} else {
		rows = v
	}

	for rows.Next() {
		var player DBPlayer
		if err := rows.Scan(
			&player.ID,
			&player.Name,
			&player.CharacterAssignment,
			&player.CharacterMetadata,
		); err != nil {
			return players, err
		}
		players = append(players, &player)
	}

	if err := rows.Err(); err != nil {
		return players, err
	}
	rows.Close()

	return players, nil
}

func (*Games) GetPlayerSeeds(userID int, variantID int) ([]string, error) {
	seeds := make([]string, 0)

	// We want to use "DISCTINCT" since it is possible for a player to play on the same seed twice
	// with the "!seed" feature or the "!replay" feature
	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT DISTINCT games.seed AS seed
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = $1
			AND games.variant_id = $2
		ORDER BY seed
	`, userID, variantID); err != nil {
		return seeds, err
	} else {
		rows = v
	}

	for rows.Next() {
		var seed string
		if err := rows.Scan(&seed); err != nil {
			return seeds, err
		}
		seeds = append(seeds, seed)
	}

	if err := rows.Err(); err != nil {
		return seeds, err
	}
	rows.Close()

	return seeds, nil
}

func (*Games) GetNotes(databaseID int, numPlayers int, noteSize int) ([][]string, error) {
	allPlayersNotes := make([][]string, numPlayers)
	for i := 0; i < numPlayers; i++ {
		allPlayersNotes[i] = make([]string, noteSize)
	}

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT
			game_participants.seat AS seat,
			game_participant_notes.card_order AS card_order,
			game_participant_notes.note AS note
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
			JOIN game_participant_notes ON game_participants.id = game_participant_notes.game_participant_id
		WHERE games.id = $1
		ORDER BY game_participants.seat, game_participant_notes.card_order
	`, databaseID); err != nil {
		return allPlayersNotes, err
	} else {
		rows = v
	}

	// These rows contain the notes for all of the players in the game, one row for each note
	for rows.Next() {
		var seat int
		var order int
		var note string
		if err := rows.Scan(&seat, &order, &note); err != nil {
			return allPlayersNotes, err
		}

		if seat > len(allPlayersNotes)-1 {
			logger.Error("The seat number of " + strconv.Itoa(seat) +
				" for the game with a database ID of " + strconv.Itoa(databaseID) + " is invalid.")
			continue
		}

		if order > len(allPlayersNotes[seat])-1 {
			logger.Error("The order of " + strconv.Itoa(order) +
				" for the game with a database ID of " + strconv.Itoa(databaseID) + " is invalid.")
			continue
		}

		allPlayersNotes[seat][order] = note
	}

	if err := rows.Err(); err != nil {
		return allPlayersNotes, err
	}
	rows.Close()

	return allPlayersNotes, nil
}

type Stats struct {
	DateJoined         time.Time
	NumGames           int
	TimePlayed         int // In seconds
	NumGamesSpeedrun   int
	TimePlayedSpeedrun int // In seconds
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
				WHERE game_participants.user_id = $1
					AND games.speedrun = FALSE
			) AS num_games,
			(
				/*
				* We enclose this query in an "COALESCE" so that it defaults to 0
				* (instead of NULL) if the user has not yet played this variant
				*/
				SELECT COALESCE(CAST(SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				) AS INTEGER), 0)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = $1
					AND games.speedrun = FALSE
			) AS time_played,
			(
				SELECT COUNT(games.id)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = $1
					AND games.speedrun = TRUE
			) AS num_games_speedrun,
			(
				/*
				* We enclose this query in an "COALESCE" so that it defaults to 0
				* (instead of NULL) if the user has not yet played this variant
				*/
				SELECT COALESCE(CAST(SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				) AS INTEGER), 0)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = $1
					AND games.speedrun = TRUE
			) AS time_played_speedrun
	`, userID).Scan(
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
				/*
				* We enclose this query in an "COALESCE" so that it defaults to 0
				* (instead of NULL) if a there are no games played yet
				*/
				SELECT COALESCE(CAST(SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				) AS INTEGER), 0)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE games.speedrun = FALSE
			) AS time_played,
			(
				SELECT COUNT(id)
				FROM games
				WHERE games.speedrun = TRUE
			) AS num_games_speedrun,
			(
				/*
				* We enclose this query in an "COALESCE" so that it defaults to 0
				* (instead of NULL) if a there are no games played yet
				*/
				SELECT COALESCE(CAST(SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				) AS INTEGER), 0)
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

func (*Games) GetVariantStats(variantID int) (Stats, error) {
	var stats Stats

	if err := db.QueryRow(context.Background(), `
		SELECT
			(
				SELECT COUNT(id)
				FROM games
				WHERE variant_id = $1
					AND speedrun = FALSE
			) AS num_games,
			(
				/*
				* We enclose this query in an "COALESCE" so that it defaults to 0
				* (instead of NULL) if a there are no games played yet of this variant
				*/
				SELECT COALESCE(CAST(SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				) AS INTEGER), 0)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE games.variant_id = $1
					AND games.speedrun = FALSE
			) AS time_played,
			(
				SELECT COUNT(id)
				FROM games
				WHERE games.variant_id = $1
					AND games.speedrun = TRUE
			) AS num_games_speedrun,
			(
				/*
				* We enclose this query in an "COALESCE" so that it defaults to 0
				* (instead of NULL) if a there are no games played yet of this variant
				*/
				SELECT COALESCE(CAST(SUM(
					EXTRACT(EPOCH FROM datetime_finished) -
					EXTRACT(EPOCH FROM datetime_started)
				) AS INTEGER), 0)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE games.variant_id = $1
					AND games.speedrun = TRUE
			) AS time_played_speedrun
	`, variantID).Scan(
		&stats.NumGames,
		&stats.TimePlayed,
		&stats.NumGamesSpeedrun,
		&stats.TimePlayedSpeedrun,
	); err != nil {
		return stats, err
	}

	return stats, nil
}

func (*Games) GetAllIDs() ([]int, error) {
	ids := make([]int, 0)

	var rows pgx.Rows
	if v, err := db.Query(context.Background(), `
		SELECT id
		FROM games
		ORDER BY id
	`); err != nil {
		return ids, err
	} else {
		rows = v
	}

	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return ids, err
		}
		ids = append(ids, id)
	}

	if err := rows.Err(); err != nil {
		return ids, err
	}
	rows.Close()

	return ids, nil
}
