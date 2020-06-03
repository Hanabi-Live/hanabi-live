package main

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"

	"github.com/jackc/pgx/v4"
)

type UserStats struct{}

// These are the stats for a user playing a specific variant + the total count of their games
type UserStatsRow struct {
	NumGames      int          `json:"numGames"`
	BestScores    []*BestScore `json:"bestScores"`
	AverageScore  float64      `json:"averageScore"`
	NumStrikeouts int          `json:"numStrikeouts"`
}

func NewUserStatsRow() UserStatsRow {
	return UserStatsRow{
		BestScores: NewBestScores(),
	}
}

type BestScore struct {
	NumPlayers   int     `json:"numPlayers"`
	Score        int     `json:"score"`
	Modifier     Bitmask `json:"modifier"` // (see the stats section in "gameEnd.go")
	DeckPlays    bool    `json:"deckPlays"`
	EmptyClues   bool    `json:"emptyClues"`
	OneExtraCard bool    `json:"oneExtraCard"`
	OneLessCard  bool    `json:"oneLessCard"`
	AllOrNothing bool    `json:"allOrNothing"`
}

func NewBestScores() []*BestScore {
	bestScores := make([]*BestScore, 5) // From 2 to 6 players
	for i := range bestScores {
		// This will not work if written as "for i, bestScore :="
		bestScores[i] = &BestScore{}
		bestScores[i].NumPlayers = i + 2
	}
	return bestScores
}

func FillBestScores(bestScores []*BestScore) {
	// The modifiers are stored as a bitmask in the database,
	// so use the bitmask to set the boolean values
	for i := range bestScores {
		modifier := bestScores[i].Modifier
		if modifier.HasFlag(ScoreModifierDeckPlays) {
			bestScores[i].DeckPlays = true
		}
		if modifier.HasFlag(ScoreModifierEmptyClues) {
			bestScores[i].EmptyClues = true
		}
		if modifier.HasFlag(ScoreModifierOneExtraCard) {
			bestScores[i].OneExtraCard = true
		}
		if modifier.HasFlag(ScoreModifierOneLessCard) {
			bestScores[i].OneLessCard = true
		}
		if modifier.HasFlag(ScoreModifierAllOrNothing) {
			bestScores[i].AllOrNothing = true
		}
	}
}

func (*UserStats) Get(userID int, variant int) (UserStatsRow, error) {
	stats := NewUserStatsRow()

	if err := db.QueryRow(context.Background(), `
		SELECT
			num_games,
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
			num_strikeouts
		FROM user_stats
		WHERE user_id = $1
			AND variant = $2
	`, userID, variant).Scan(
		&stats.NumGames,
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
		&stats.NumStrikeouts,
	); err == pgx.ErrNoRows {
		// This user has not played this variant before,
		// so return a stats object that contains all zero values
		return stats, nil
	} else if err != nil {
		return stats, err
	}

	FillBestScores(stats.BestScores)

	return stats, nil
}

func (*UserStats) GetAll(userID int) (map[int]UserStatsRow, error) {
	// Get all of the statistics for this user (for every individual variant)
	rows, err := db.Query(context.Background(), `
		SELECT
			variant,
			num_games,
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
			num_strikeouts
		FROM user_stats
		WHERE user_id = $1
		ORDER BY variant ASC
	`, userID)

	// Go through the stats for each variant
	statsMap := make(map[int]UserStatsRow)
	for rows.Next() {
		var variant int
		stats := NewUserStatsRow()
		if err2 := rows.Scan(
			&variant,
			&stats.NumGames,
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
			&stats.NumStrikeouts,
		); err2 != nil {
			return nil, err2
		}

		FillBestScores(stats.BestScores)

		statsMap[variant] = stats
	}

	if rows.Err() != nil {
		return nil, err
	}
	rows.Close()

	return statsMap, nil
}

func (*UserStats) Update(userID int, variant int, stats UserStatsRow) error {
	// Validate that the BestScores slice contains 5 entries
	if len(stats.BestScores) != 5 {
		return errors.New("BestScores does not contain 5 entries (for 2 to 6 players)")
	}

	// First, check to see if they have a row in the stats table for this variant already
	// If they don't, then we need to insert a new row
	var numRows int
	if err := db.QueryRow(context.Background(), `
		SELECT COUNT(user_id)
		FROM user_stats
		WHERE user_id = $1
			AND variant = $2
	`, userID, variant).Scan(&numRows); err != nil {
		return err
	}
	if numRows == 0 {
		if _, err := db.Exec(context.Background(), `
			INSERT INTO user_stats (user_id, variant)
			VALUES ($1, $2)
		`, userID, variant); err != nil {
			return err
		}
	}

	_, err := db.Exec(
		context.Background(),
		`
			UPDATE user_stats
			SET
				num_games = (
					SELECT COUNT(games.id)
					FROM games
						JOIN game_participants
							ON game_participants.game_id = games.id
					WHERE game_participants.user_id = $1
						AND games.variant = $2
						AND games.speedrun = FALSE
				),
				best_score2 = $3,
				best_score2_mod = $4,
				best_score3 = $5,
				best_score3_mod = $6,
				best_score4 = $7,
				best_score4_mod = $8,
				best_score5 = $9,
				best_score5_mod = $10,
				best_score6 = $11,
				best_score6_mod = $12,
				average_score = (
					/*
					 * We enclose this query in an "COALESCE" so that it defaults to 0
					 * (instead of NULL) if the user has not played any games in this variant
					 */
					SELECT COALESCE(AVG(games.score), 0)
					FROM games
						JOIN game_participants
							ON game_participants.game_id = games.id
					WHERE game_participants.user_id = $1
						AND games.score != 0
						AND games.variant = $2
						AND games.speedrun = FALSE
				),
				num_strikeouts = (
					SELECT COUNT(games.id)
					FROM games
						JOIN game_participants
							ON game_participants.game_id = games.id
					WHERE game_participants.user_id = $1
						AND games.score = 0
						AND games.variant = $2
						AND games.speedrun = FALSE
				)
			WHERE user_id = $1
				AND variant = $2
		`,
		userID, // num_games
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
	)
	return err
}

func (us *UserStats) UpdateAll(highestVariantID int) error {
	// Delete all of the existing rows
	if _, err := db.Exec(context.Background(), "DELETE FROM user_stats"); err != nil {
		return err
	}

	// Get all of the users
	rows, err := db.Query(context.Background(), "SELECT id FROM users")

	var userIDs []int
	for rows.Next() {
		var userID int
		if err2 := rows.Scan(&userID); err2 != nil {
			return err2
		}
		userIDs = append(userIDs, userID)
	}

	if rows.Err() != nil {
		return err
	}
	rows.Close()

	// Sort the user IDs (ascending)
	sort.Slice(userIDs, func(i, j int) bool {
		return userIDs[i] < userIDs[j]
	})
	fmt.Println("Total users:", len(userIDs))
	fmt.Println("(From user " + strconv.Itoa(userIDs[0]) + " " +
		"to user " + strconv.Itoa(userIDs[len(userIDs)-1]) + ".)")

	// Go through each user
	for _, userID := range userIDs {
		fmt.Println("Updating user:", userID)
		for variant := 0; variant <= highestVariantID; variant++ {
			// Check to see if this user has played any games of this variant
			var numRows int
			if err := db.QueryRow(context.Background(), `
				SELECT COUNT(game_participants.game_id)
				FROM games
					JOIN game_participants ON games.id = game_participants.game_id
				WHERE game_participants.user_id = $1
					AND games.variant = $2
			`, userID, variant).Scan(&numRows); err != nil {
				return err
			}
			if numRows == 0 {
				// We don't need to insert a new row for this variant
				continue
			}

			// Update scores for players 2 through 6
			stats := NewUserStatsRow()
			for numPlayers := 2; numPlayers <= 6; numPlayers++ {
				overallBestScore := 0
				var overallBestScoreMod Bitmask

				// Go through each modifier
				var modifier Bitmask
				for modifier = 0; modifier <= 7; modifier++ {
					// Get the score for this player count and modifier
					SQLString := `
						/*
						 * We enclose this query in an "COALESCE" so that it defaults to 0
						 * (instead of NULL) if the user has not played any games in this variant
						 */
						SELECT COALESCE(MAX(games.score), 0)
						FROM games
							JOIN game_participants
								ON game_participants.game_id = games.id
						WHERE game_participants.user_id = $1
							AND games.variant = $2
							AND games.num_players = $3
					`

					SQLString += "AND games.deck_plays = "
					if modifier.HasFlag(ScoreModifierDeckPlays) {
						SQLString += "TRUE "
					} else {
						SQLString += "FALSE "
					}

					SQLString += "AND games.empty_clues = "
					if modifier.HasFlag(ScoreModifierEmptyClues) {
						SQLString += "TRUE "
					} else {
						SQLString += "FALSE "
					}

					SQLString += "AND games.one_extra_card = "
					if modifier.HasFlag(ScoreModifierOneExtraCard) {
						SQLString += "TRUE "
					} else {
						SQLString += "FALSE "
					}

					SQLString += "AND games.one_less_card = "
					if modifier.HasFlag(ScoreModifierOneLessCard) {
						SQLString += "TRUE "
					} else {
						SQLString += "FALSE "
					}

					SQLString += "AND games.all_or_nothing = "
					if modifier.HasFlag(ScoreModifierAllOrNothing) {
						SQLString += "TRUE "
					} else {
						SQLString += "FALSE "
					}

					var bestScore int
					if err := db.QueryRow(
						context.Background(),
						SQLString,
						userID,
						variant,
						numPlayers,
					).Scan(&bestScore); err != nil {
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
