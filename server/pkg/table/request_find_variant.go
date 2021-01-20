package table

import (
	"context"
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

func (m *Manager) FindVariant() {
	m.newRequest(requestTypeFindVariant, nil) // nolint: errcheck
}

func (m *Manager) findVariant(data interface{}) {
	// Local variables
	t := m.table

	// If this is a pregame or ongoing game, make a list of the players
	// If this is a shared replay, make a list of the spectators
	userIDs := make([]int, 0)
	if t.Replay {
		for _, sp := range t.spectators {
			userIDs = append(userIDs, sp.userID)
		}
	} else {
		for _, p := range t.Players {
			userIDs = append(userIDs, p.UserID)
		}
	}

	if len(userIDs) < 2 || len(userIDs) > 6 {
		noun := "game"
		if t.Replay {
			noun = "shared replay"
		}
		msg := fmt.Sprintf(
			"You can only perform this command if the %v has between 2 and 6 players.",
			noun,
		)
		m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
		return
	}

	// Get all of the variant-specific stats for these players
	statsMaps := make([]map[int]*models.UserStatsRow, 0)
	for _, userID := range userIDs {
		if statsMap, err := m.models.UserStats.GetAll(context.Background(), userID); err != nil {
			m.logger.Errorf(
				"Failed to get all of the variant-specific stats for player ID %v: %v",
				userID,
				err,
			)
			m.Dispatcher.Chat.ChatServer(constants.DefaultErrorMsg, t.getRoomName())
			return
		} else {
			statsMaps = append(statsMaps, statsMap)
		}
	}

	// Make a list of variants that no-one has the max score in
	variantsWithNoMaxScores := make([]string, 0)
	for _, variant := range m.Dispatcher.Variants.GetVariants() {
		maxScore := len(variant.Suits) * constants.PointsPerSuit
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
	randomIndex := util.GetRandom(0, len(variantsWithNoMaxScores)-1)
	randomVariant := variantsWithNoMaxScores[randomIndex]

	msg := fmt.Sprintf(
		"Here is a random variant that everyone needs the %v-player max score in: %v",
		len(userIDs),
		randomVariant,
	)
	m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
}
