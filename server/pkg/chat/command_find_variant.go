package chat

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/models"
)

// /findvariant
// This function does not consider modifiers (e.g. "Empty Clues").
func (m *Manager) commandFindVariant() {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	// If this is a pregame or ongoing game, make a list of the players
	// If this is a shared replay, make a list of the spectators
	userIDs := make([]int, 0)
	if t.Replay {
		for _, sp := range t.Spectators {
			userIDs = append(userIDs, sp.UserID)
		}
	} else {
		for _, p := range t.Players {
			userIDs = append(userIDs, p.UserID)
		}
	}

	if len(userIDs) < 2 || len(userIDs) > 6 {
		msg := "You can only perform this command if the game or shared replay has between 2 and 6 players."
		chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
		return
	}

	// Get all of the variant-specific stats for these players
	statsMaps := make([]map[int]*UserStatsRow, 0)
	for _, userID := range userIDs {
		if statsMap, err := models.UserStats.GetAll(userID); err != nil {
			hLog.Errorf(
				"Failed to get all of the variant-specific stats for player ID %v: %v",
				userID,
				err,
			)
			chatServerSend(ctx, DefaultErrorMsg, d.Room, d.NoTablesLock)
			return
		} else {
			statsMaps = append(statsMaps, statsMap)
		}
	}

	// Make a list of variants that no-one has the max score in
	variantsWithNoMaxScores := make([]string, 0)
	for _, variant := range variants {
		maxScore := len(variant.Suits) * PointsPerSuit
		someoneHasMaxScore := false
		for _, statsMap := range statsMaps {
			if stats, ok := statsMap[variant.ID]; ok {
				// This player has played at least one game in this particular variant
				// Check to see if they have a max score
				// We minus 2 because element 0 is for 2-player, element 1 is for 3-player, etc.
				if stats.BestScores[len(userIDs)-2].Score == maxScore {
					someoneHasMaxScore = true
					break
				}
			}
		}
		if !someoneHasMaxScore {
			variantsWithNoMaxScores = append(variantsWithNoMaxScores, variant.Name)
		}
	}

	// Get a random element from the list
	randomIndex := getRandom(0, len(variantsWithNoMaxScores)-1)
	randomVariant := variantsWithNoMaxScores[randomIndex]

	msg := fmt.Sprintf(
		"Here is a random variant that everyone needs the %v-player max score in: %v",
		len(userIDs),
		randomVariant,
	)
	chatServerSend(ctx, msg, d.Room, d.NoTablesLock)
}
