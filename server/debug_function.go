package main

/*

import (
	"context"
)

var (
	badGameIDs = make([]int, 0)
)

func debugFunction(ctx context.Context) {
	hLog.Debug("Executing debug function(s).")

	// updateAllSeedNumGames()
	// updateAllUserStats()
	// updateAllVariantStats()
	// updateUserStatsFromPast24Hours()
	// getBadGameIDs()

	// updateUserStatsFromInterval("2 hours")

	hLog.Debug("Debug function(s) complete.")
}

func updateAllSeedNumGames() {
	if err := models.Seeds.UpdateAll(); err != nil {
		hLog.Errorf("Failed to update the number of games for every seed: %v", err)
		return
	}
	hLog.Info("Updated the number of games for every seed.")
}

func updateAllUserStats() {
	if err := models.UserStats.UpdateAll(variantGetHighestID()); err != nil {
		hLog.Errorf("Failed to update the stats for every user: %v", err)
		return
	}
	hLog.Info("Updated the stats for every user.")
}

func updateAllVariantStats() {
	highestID := variantGetHighestID()
	maxScores := make([]int, 0)
	for i := 0; i <= highestID; i++ {
		variantName := variantIDMap[i]
		variant := variants[variantName]
		maxScores = append(maxScores, variant.MaxScore)
	}

	if err := models.VariantStats.UpdateAll(highestID, maxScores); err != nil {
		hLog.Errorf("Failed to update the stats for every variant: %v", err)
		return
	} else {
		hLog.Info("Updated the stats for every variant.")
	}
}
*/

/*
func updateUserStatsFromInterval(interval string) {
	// Get the games played in the last X hours/days/whatever
	// Interval must mast a valid Postgres interval
	// https://popsql.com/learn-sql/postgresql/how-to-query-date-and-time-in-postgresql
	var gameIDs []int
	if v, err := models.Games.GetGameIDsSinceInterval(interval); err != nil {
		hLog.Errorf("Failed to get the game IDs for the last \"%v\": %v", interval, err)
		return
	} else {
		gameIDs = v
	}

	updateStatsFromGameIDs(gameIDs)
}

func updateStatsFromGameIDs(gameIDs []int) {
	// Get the games corresponding to these IDs
	var gameHistoryList []*GameHistory
	if v, err := models.Games.GetHistory(gameIDs); err != nil {
		hLog.Errorf("Failed to get the games from the database: %v", err)
		return
	} else {
		gameHistoryList = v
	}

	for _, gameHistory := range gameHistoryList {
		updateStatsFromGameHistory(gameHistory)
	}
}

// updateStatsFromGameHistory is mostly copied from the "Game.WriteDatabaseStats()" function
// (the difference is that it works on a "GameHistory" instead of a "Game")
func updateStatsFromGameHistory(gameHistory *GameHistory) {
	hLog.Debugf("Updating stats for game: %v", gameHistory.ID)

	// Local variables
	variant := variants[gameHistory.Options.VariantName]
	// 2-player is at index 0, 3-player is at index 1, etc.
	bestScoreIndex := gameHistory.Options.NumPlayers - 2

	// Update the variant-specific stats for each player
	modifier := gameHistory.Options.GetModifier()
	for _, playerName := range gameHistory.PlayerNames {
		// Check to see if this username exists in the database
		var userID int
		if exists, v, err := models.Users.Get(playerName); err != nil {
			hLog.Errorf("Failed to get user \"%v\": %v", playerName, err)
			return
		} else if !exists {
			hLog.Errorf("User \"%v\" does not exist in the database.", playerName)
			return
		} else {
			userID = v.ID
		}

		// Get their current best scores
		var userStats *UserStatsRow
		if v, err := models.UserStats.Get(userID, variant.ID); err != nil {
			hLog.Errorf("Failed to get the stats for user \"%v\": %v", playerName, err)
			return
		} else {
			userStats = v
		}

		thisScore := &BestScore{
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
		if err := models.UserStats.Update(userID, variant.ID, userStats); err != nil {
			hLog.Errorf("Failed to update the stats for user \"%v\": %v", playerName, err)
			return
		}
	}

	// Get the current stats for this variant
	var variantStats VariantStatsRow
	if v, err := models.VariantStats.Get(variant.ID); err != nil {
		hLog.Errorf("Failed to get the stats for variant ID %v: %v", variant.ID, err)
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
	if err := models.VariantStats.Update(variant.ID, variant.MaxScore, variantStats); err != nil {
		hLog.Errorf("Failed to update the stats for variant ID %v: %v", variant.ID, err)
		return
	}
}

func variantGetHighestID() int {
	highestID := 0
	for k := range variantIDMap {
		if k > highestID {
			highestID = k
		}
	}
	return highestID
}

func getBadGameIDs() {
	// Get all game IDs
	var ids []int
	if v, err := models.Games.GetAllIDs(); err != nil {
		hLog.Fatalf("Failed to get all of the game IDs: %v", err)
	} else {
		ids = v
	}

	for i, id := range ids {
		if i > 1000 {
			break
		}
		hLog.Debugf("ON GAME: %v", id)
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

	hLog.Debug("BAD GAME IDS:")
	hLog.Debug(strings.Join(badGameIDs, ", "))
}

*/
