package httplocalhost

import (
	"context"
	"net/http"

	"github.com/Zamiell/hanabi-live/server/pkg/bestscore"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/variants"
	"github.com/gin-gonic/gin"
)

func (m *Manager) debugFunction(c *gin.Context) {
	m.logger.Debug("Executing debug function(s).")
	m.debugFunction2()
	m.logger.Debug("Debug function(s) complete.")
	c.String(http.StatusOK, "success\n")
}

var (
	badGameIDs = make([]int, 0)
)

func (m *Manager) debugFunction2() {
	// updateAllSeedNumGames()
	// updateAllUserStats()
	// updateAllVariantStats()
	// updateUserStatsFromPast24Hours()
	// getBadGameIDs()
	// updateUserStatsFromInterval("2 hours")
}

func (m *Manager) updateAllSeedNumGames() {
	if err := m.models.Seeds.UpdateAll(context.Background()); err != nil {
		m.logger.Errorf("Failed to update the number of games for every seed: %v", err)
		return
	}
	m.logger.Info("Updated the number of games for every seed.")
}

func (m *Manager) updateAllUserStats() {
	if err := m.models.UserStats.UpdateAll(context.Background(), m.variantGetHighestID()); err != nil {
		m.logger.Errorf("Failed to update the stats for every user: %v", err)
		return
	}
	m.logger.Info("Updated the stats for every user.")
}

func (m *Manager) updateAllVariantStats() {
	highestID := m.variantGetHighestID()
	maxScores := make([]int, 0)
	for i := 0; i <= highestID; i++ {
		var variant *variants.Variant
		if v, err := m.Dispatcher.Variants.GetVariantByID(i); err != nil {
			m.logger.Errorf("Failed to get variant %v from the variants map: %v", i, err)
			return
		} else {
			variant = v
		}

		maxScores = append(maxScores, variant.MaxScore)
	}

	if err := m.models.VariantStats.UpdateAll(
		context.Background(),
		highestID,
		maxScores,
	); err != nil {
		m.logger.Errorf("Failed to update the stats for every variant: %v", err)
		return
	} else {
		m.logger.Info("Updated the stats for every variant.")
	}
}

func (m *Manager) updateUserStatsFromInterval(interval string) {
	// Get the games played in the last X hours/days/whatever
	// Interval must mast a valid Postgres interval
	// https://popsql.com/learn-sql/postgresql/how-to-query-date-and-time-in-postgresql
	var gameIDs []int
	if v, err := m.models.Games.GetGameIDsSinceInterval(context.Background(), interval); err != nil {
		m.logger.Errorf("Failed to get the game IDs for the last \"%v\": %v", interval, err)
		return
	} else {
		gameIDs = v
	}

	m.updateStatsFromGameIDs(gameIDs)
}

func (m *Manager) updateStatsFromGameIDs(gameIDs []int) {
	// Get the games corresponding to these IDs
	var gameHistoryList []*models.GameHistory
	if v, err := m.models.Games.GetHistory(context.Background(), gameIDs); err != nil {
		m.logger.Errorf("Failed to get the games from the database: %v", err)
		return
	} else {
		gameHistoryList = v
	}

	for _, gameHistory := range gameHistoryList {
		m.updateStatsFromGameHistory(gameHistory)
	}
}

// updateStatsFromGameHistory is mostly copied from the "Game.WriteDatabaseStats()" function
// (the difference is that it works on a "GameHistory" instead of a "Game")
func (m *Manager) updateStatsFromGameHistory(gameHistory *models.GameHistory) {
	m.logger.Debugf("Updating stats for game: %v", gameHistory.ID)

	// Local variables
	var variant *variants.Variant
	if v, err := m.Dispatcher.Variants.GetVariant(gameHistory.Options.VariantName); err != nil {
		m.logger.Errorf(
			"Failed to get variant \"%v\" from the variants map: %v",
			gameHistory.Options.VariantName,
			err,
		)
		return
	} else {
		variant = v
	}

	// 2-player is at index 0, 3-player is at index 1, etc.
	bestScoreIndex := gameHistory.Options.NumPlayers - 2

	// Update the variant-specific stats for each player
	modifier := gameHistory.Options.GetModifier()
	for _, playerName := range gameHistory.PlayerNames {
		// Check to see if this username exists in the database
		var userID int
		if exists, v, err := m.models.Users.Get(context.Background(), playerName); err != nil {
			m.logger.Errorf("Failed to get user \"%v\": %v", playerName, err)
			return
		} else if !exists {
			m.logger.Errorf("User \"%v\" does not exist in the database.", playerName)
			return
		} else {
			userID = v.ID
		}

		// Get their current best scores
		var userStats *models.UserStatsRow
		if v, err := m.models.UserStats.Get(context.Background(), userID, variant.ID); err != nil {
			m.logger.Errorf("Failed to get the stats for user \"%v\": %v", playerName, err)
			return
		} else {
			userStats = v
		}

		thisScore := &bestscore.BestScore{
			Score:    gameHistory.Score,
			Modifier: modifier,
		}
		bestScore := userStats.BestScores[bestScoreIndex]
		if thisScore.IsBetterThan(bestScore) {
			bestScore.Score = gameHistory.Score
			bestScore.Modifier = modifier
		}

		// Update their stats
		// (even if they did not get a new best score,
		// we still want to update their average score and strikeout rate)
		if err := m.models.UserStats.Update(
			context.Background(),
			userID,
			variant.ID,
			userStats,
		); err != nil {
			m.logger.Errorf("Failed to update the stats for user \"%v\": %v", playerName, err)
			return
		}
	}

	// Get the current stats for this variant
	var variantStats *models.VariantStatsRow
	if v, err := m.models.VariantStats.Get(context.Background(), variant.ID); err != nil {
		m.logger.Errorf("Failed to get the stats for variant ID %v: %v", variant.ID, err)
		return
	} else {
		variantStats = v
	}

	// If the game was played with no modifiers, update the stats for this variant
	if modifier == 0 {
		bestScore := variantStats.BestScores[bestScoreIndex]
		if gameHistory.Score > bestScore.Score {
			bestScore.Score = gameHistory.Score
		}
	}

	// Write the updated stats to the database
	// (even if the game was played with modifiers,
	// we still need to update the number of games played)
	if err := m.models.VariantStats.Update(
		context.Background(),
		variant.ID,
		variant.MaxScore,
		variantStats,
	); err != nil {
		m.logger.Errorf("Failed to update the stats for variant ID %v: %v", variant.ID, err)
		return
	}
}

func (m *Manager) variantGetHighestID() int {
	highestID := 0
	for _, variant := range m.Dispatcher.Variants.GetVariants() {
		if variant.ID > highestID {
			highestID = variant.ID
		}
	}

	return highestID
}

func (m *Manager) getBadGameIDs() {
	/*
		// Get all game IDs
		var ids []int
		if v, err := m.models.Games.GetAllIDs(context.Background()); err != nil {
			m.logger.Fatalf("Failed to get all of the game IDs: %v", err)
		} else {
			ids = v
		}

		for i, id := range ids {
			if i > 1000 {
				break
			}
			m.logger.Debugf("ON GAME: %v", id)
			s := NewFakeSession(1, "Server")
			commandReplayCreate(s, &CommandData{ // nolint: exhaustivestruct
				Source:     "id",
				GameID:     id,
				Visibility: "solo",
			})
			commandTableUnattend(s, &CommandData{ // nolint: exhaustivestruct
				TableID: tableIDCounter,
			})
		}

		m.logger.Debug("BAD GAME IDS:")
		m.logger.Debug(strings.Join(badGameIDs, ", "))
	*/
}
