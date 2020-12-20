package models

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/options"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/jackc/pgx/v4"
)

type Games struct {
	m *Models
}

// GameRow roughly mirrors the "games" database table row.
// It contains a subset of the information in the Game struct.
type GameRow struct {
	Name             string
	Options          *options.Options
	Seed             string
	Score            int
	NumTurns         int
	EndCondition     int
	DatetimeStarted  time.Time
	DatetimeFinished time.Time
}

func (g *Games) Insert(ctx context.Context, gameRow GameRow) (int, error) {
	// https://www.postgresql.org/docs/9.5/dml-returning.html
	// https://github.com/jackc/pgx/issues/411
	SQLString := `
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
	`

	var id int
	if err := g.m.db.QueryRow(
		ctx,
		SQLString,
		gameRow.Name,
		gameRow.Options.NumPlayers,
		gameRow.Options.VariantID,
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

func (g *Games) Exists(ctx context.Context, databaseID int) (bool, error) {
	SQLString := `
		SELECT id
		FROM games
		WHERE id = $1
	`

	var id int
	if err := g.m.db.QueryRow(ctx, SQLString, databaseID).Scan(&id); errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	} else if err != nil {
		return false, err
	}

	return true, nil
}

type GameHistory struct {
	ID                 int              `json:"id"`
	Options            *options.Options `json:"options"`
	Seed               string           `json:"seed"`
	Score              int              `json:"score"`
	NumTurns           int              `json:"numTurns"`
	EndCondition       int              `json:"endCondition"`
	DatetimeStarted    time.Time        `json:"datetimeStarted"`
	DatetimeFinished   time.Time        `json:"datetimeFinished"`
	NumGamesOnThisSeed int              `json:"numGamesOnThisSeed"`
	PlayerNames        []string         `json:"playerNames"`
	IncrementNumGames  bool             `json:"incrementNumGames"`
	Tags               string           `json:"tags"`
}

func (g *Games) GetHistory(ctx context.Context, gameIDs []int) ([]*GameHistory, error) {
	return g.GetHistoryCustomSort(ctx, gameIDs, "normal")
}

func (g *Games) GetHistoryCustomSort(
	ctx context.Context,
	gameIDs []int,
	sortMode string,
) ([]*GameHistory, error) {
	games := make([]*GameHistory, 0)

	var sortSQL string
	if sortMode == "normal" {
		// Normally, we want history to be displayed with the newest game at the top
		sortSQL = "games1.id DESC"
	} else if sortMode == "seed" {
		// For viewing games of the same seed, we want the best scores to be at the top,
		// with the first group to get that score displayed on top
		sortSQL = "games1.score DESC, games1.id ASC"
	} else {
		err := fmt.Errorf("unknown sort mode of: %v", sortMode)
		return games, err
	}

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
				/**
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
		/**
		 * We must use the ANY operator for matching an array of IDs:
		 * https://github.com/jackc/pgx/issues/334
		 */
		WHERE games1.id = ANY($1)
	`
	SQLString += fmt.Sprintf("ORDER BY %v", sortSQL)

	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString, gameIDs); err != nil {
		return games, err
	} else {
		rows = v
	}

	for rows.Next() {
		gameHistory := GameHistory{ // nolint: exhaustivestruct
			Options: options.NewOptions(),
		}
		var playerNamesString string
		if err := rows.Scan(
			&gameHistory.ID,
			&gameHistory.Options.NumPlayers,
			&gameHistory.Options.VariantID,
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
		if variant, err := g.m.variantsManager.GetVariantByID(
			gameHistory.Options.VariantID,
		); err != nil {
			return games, err
		} else {
			gameHistory.Options.VariantName = variant.Name
		}

		// The players come from the database in a random order
		// (since we did not include an "ORDER BY" keyword)
		// Alphabetize the players (case-insensitive)
		playerNames := strings.Split(playerNamesString, ", ")
		playerNames = util.SortStringsCaseInsensitive(playerNames)
		gameHistory.PlayerNames = playerNames

		games = append(games, &gameHistory)
	}

	if err := rows.Err(); err != nil {
		return games, err
	}
	rows.Close()

	return games, nil
}

func (g *Games) GetGameIDsUser(
	ctx context.Context,
	userID int,
	offset int,
	amount int,
) ([]int, error) {
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

	gameIDs := make([]int, 0)
	var rows pgx.Rows
	if amount > 0 {
		if v, err := g.m.db.Query(ctx, SQLString, userID, amount, offset); err != nil {
			return gameIDs, err
		} else {
			rows = v
		}
	} else {
		if v, err := g.m.db.Query(ctx, SQLString, userID); err != nil {
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

func (g *Games) GetGameIDsSeed(ctx context.Context, seed string) ([]int, error) {
	SQLString := `
		SELECT id
		FROM games
		WHERE seed = $1
	`

	gameIDs := make([]int, 0)
	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString, seed); err != nil {
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

func (g *Games) GetGameIDsFriends(
	ctx context.Context,
	userID int,
	friends map[int]struct{},
	offset int,
	amount int,
) ([]int, error) {
	friendIDs := make([]int, 0)
	for friendID := range friends {
		friendIDs = append(friendIDs, friendID)
	}

	SQLString := `
		SELECT DISTINCT games.id
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		/**
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

	gameIDs := make([]int, 0)
	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString, friendIDs, userID, amount, offset); err != nil {
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

func (g *Games) GetGameIDsMultiUser(ctx context.Context, userIDs []int) ([]int, error) {
	gameIDs := make([]int, 0)

	// First, validate that all of the user IDs are unique
	userIDMap := make(map[int]struct{})
	for _, userID := range userIDs {
		if _, ok := userIDMap[userID]; ok {
			err := fmt.Errorf("the list of user IDs contained a duplicate entry of: %v", userID)
			return gameIDs, err
		}
		userIDMap[userID] = struct{}{}
	}

	SQLString := `
		SELECT DISTINCT games.id
		FROM games
	`
	for _, id := range userIDs {
		SQLString += fmt.Sprintf("JOIN game_participants AS player%v_games ", id)
		SQLString += fmt.Sprintf("ON games.id = player%v_games.game_id ", id)
		SQLString += fmt.Sprintf("AND player%v_games.user_id = %v ", id, id)
	}

	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString); err != nil {
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

func (g *Games) GetGameIDsVariant(ctx context.Context, variantID int, amount int) ([]int, error) {
	SQLString := `
		SELECT id
		FROM games
		WHERE variant_id = $1
		/* We must get the results in decending order for the limit to work properly */
		ORDER BY id DESC
		LIMIT $2
	`

	gameIDs := make([]int, 0)
	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString, variantID, amount); err != nil {
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

func (g *Games) GetGameIDsPastX(ctx context.Context, amount int) ([]int, error) {
	SQLString := `
		SELECT id
		FROM games
		/* We must get the results in decending order for the limit to work properly */
		ORDER BY id DESC
		LIMIT $1
	`

	gameIDs := make([]int, 0)
	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString, amount); err != nil {
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

func (g *Games) GetGameIDsSinceDatetime(ctx context.Context, datetime string) ([]int, error) {
	SQLString := `
		SELECT id
		FROM games
		/* We must get the results in decending order for the limit to work properly */
		ORDER BY id DESC
		WHERE datetime_started > $1
	`

	gameIDs := make([]int, 0)
	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString, datetime); err != nil {
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

func (g *Games) GetGameIDsSinceInterval(ctx context.Context, interval string) ([]int, error) {
	SQLString := `
		SELECT id
		FROM games
		WHERE datetime_started > NOW() - INTERVAL `
	SQLString += fmt.Sprintf("'%v'", interval) // We can't use $1 for intervals for some reason

	gameIDs := make([]int, 0)
	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString); err != nil {
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

func (g *Games) GetUserNumGames(
	ctx context.Context,
	userID int,
	includeSpeedrun bool,
) (int, error) {
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
	if err := g.m.db.QueryRow(ctx, SQLString, userID).Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (g *Games) GetOptions(ctx context.Context, databaseID int) (*options.Options, error) {
	SQLString := `
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
	`

	var options options.Options
	if err := g.m.db.QueryRow(ctx, SQLString, databaseID).Scan(
		&options.NumPlayers,
		&options.StartingPlayer,
		&options.VariantID,
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
	if variant, err := g.m.variantsManager.GetVariantByID(options.VariantID); err != nil {
		return &options, err
	} else {
		options.VariantName = variant.Name
	}

	return &options, nil
}

func (g *Games) GetNumPlayers(ctx context.Context, databaseID int) (int, error) {
	SQLString := `
		SELECT COUNT(game_participants.game_id)
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE games.id = $1
	`

	var numPlayers int
	err := g.m.db.QueryRow(ctx, SQLString, databaseID).Scan(&numPlayers)
	return numPlayers, err
}

func (g *Games) GetNumTurns(ctx context.Context, databaseID int) (int, error) {
	SQLString := `
		SELECT num_turns
		FROM games
		WHERE games.id = $1
	`

	var numTurns int
	err := g.m.db.QueryRow(ctx, SQLString, databaseID).Scan(&numTurns)
	return numTurns, err
}

func (g *Games) GetSeed(ctx context.Context, databaseID int) (string, error) {
	SQLString := `
		SELECT seed
		FROM games
		WHERE games.id = $1
	`

	var seed string
	err := g.m.db.QueryRow(ctx, SQLString, databaseID).Scan(&seed)
	return seed, err
}

func (g *Games) GetDatetimes(ctx context.Context, databaseID int) (time.Time, time.Time, error) {
	SQLString := `
		SELECT datetime_started, datetime_finished
		FROM games
		WHERE games.id = $1
	`

	var datetimeStarted time.Time
	var datetimeFinished time.Time
	err := g.m.db.QueryRow(ctx, SQLString, databaseID).Scan(&datetimeStarted, &datetimeFinished)
	return datetimeStarted, datetimeFinished, err
}

type DBPlayer struct {
	ID                  int
	Name                string
	CharacterAssignment int
	CharacterMetadata   int
}

func (g *Games) GetPlayers(ctx context.Context, databaseID int) ([]*DBPlayer, error) {
	SQLString := `
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
	`

	dbPlayers := make([]*DBPlayer, 0)
	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString, databaseID); err != nil {
		return dbPlayers, err
	} else {
		rows = v
	}

	for rows.Next() {
		var dbPlayer DBPlayer
		if err := rows.Scan(
			&dbPlayer.ID,
			&dbPlayer.Name,
			&dbPlayer.CharacterAssignment,
			&dbPlayer.CharacterMetadata,
		); err != nil {
			return dbPlayers, err
		}
		dbPlayers = append(dbPlayers, &dbPlayer)
	}

	if err := rows.Err(); err != nil {
		return dbPlayers, err
	}
	rows.Close()

	return dbPlayers, nil
}

func (g *Games) GetPlayerSeeds(ctx context.Context, userID int, variantID int) ([]string, error) {
	// We want to use "DISCTINCT" since it is possible for a player to play on the same seed twice
	// with the "!seed" feature or the "!replay" feature
	SQLString := `
		SELECT DISTINCT games.seed AS seed
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
		WHERE game_participants.user_id = $1
			AND games.variant_id = $2
		ORDER BY seed
	`

	seeds := make([]string, 0)
	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString, userID, variantID); err != nil {
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

func (g *Games) GetNotes(
	ctx context.Context,
	databaseID int,
	numPlayers int,
	noteSize int,
) ([][]string, error) {
	allPlayersNotes := make([][]string, numPlayers)
	for i := 0; i < numPlayers; i++ {
		allPlayersNotes[i] = make([]string, noteSize)
	}

	SQLString := `
		SELECT
			game_participants.seat AS seat,
			game_participant_notes.card_order AS card_order,
			game_participant_notes.note AS note
		FROM games
			JOIN game_participants ON games.id = game_participants.game_id
			JOIN game_participant_notes ON game_participants.id = game_participant_notes.game_participant_id
		WHERE games.id = $1
		ORDER BY game_participants.seat, game_participant_notes.card_order
	`

	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString, databaseID); err != nil {
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

		if seat < 0 || seat > len(allPlayersNotes)-1 {
			g.m.logger.Errorf(
				"The seat number of %v for the game with a database ID of %v is invalid.",
				seat,
				databaseID,
			)
			continue
		}

		if order < 0 || order > len(allPlayersNotes[seat])-1 {
			g.m.logger.Errorf(
				"The order of %v for the game with a database ID of %v is invalid.",
				order,
				databaseID,
			)
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

func (g *Games) GetProfileStats(ctx context.Context, userID int) (Stats, error) {
	SQLString := `
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
				/**
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
				/**
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
	`

	var stats Stats
	if err := g.m.db.QueryRow(ctx, SQLString, userID).Scan(
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

func (g *Games) GetGlobalStats(ctx context.Context) (Stats, error) {
	SQLString := `
		SELECT
			(
				SELECT COUNT(id)
				FROM games
				WHERE games.speedrun = FALSE
			) AS num_games,
			(
				/**
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
				/**
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
	`

	var stats Stats
	if err := g.m.db.QueryRow(ctx, SQLString).Scan(
		&stats.NumGames,
		&stats.TimePlayed,
		&stats.NumGamesSpeedrun,
		&stats.TimePlayedSpeedrun,
	); err != nil {
		return stats, err
	}

	return stats, nil
}

func (g *Games) GetVariantStats(ctx context.Context, variantID int) (Stats, error) {
	SQLString := `
		SELECT
			(
				SELECT COUNT(id)
				FROM games
				WHERE variant_id = $1
					AND speedrun = FALSE
			) AS num_games,
			(
				/**
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
				/**
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
	`

	var stats Stats
	if err := g.m.db.QueryRow(ctx, SQLString, variantID).Scan(
		&stats.NumGames,
		&stats.TimePlayed,
		&stats.NumGamesSpeedrun,
		&stats.TimePlayedSpeedrun,
	); err != nil {
		return stats, err
	}

	return stats, nil
}

func (g *Games) GetAllIDs(ctx context.Context) ([]int, error) {
	SQLString := `
		SELECT id
		FROM games
		ORDER BY id
	`

	ids := make([]int, 0)
	var rows pgx.Rows
	if v, err := g.m.db.Query(ctx, SQLString); err != nil {
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
