package table

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type kickData struct {
	userID         int
	targetUsername string
}

func (m *Manager) Kick(userID int, targetUsername string) {
	m.newRequest(requestTypeKick, &kickData{ // nolint: errcheck
		userID:         userID,
		targetUsername: targetUsername,
	})
}

func (m *Manager) kick(data interface{}) {
	var d *kickData
	if v, ok := data.(*kickData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table

	if t.Running {
		m.Dispatcher.Chat.ChatServer(constants.NotStartedFail, t.getRoomName())
		return
	}

	if d.userID != t.OwnerID {
		m.Dispatcher.Chat.ChatServer(constants.NotOwnerFail, t.getRoomName())
		return
	}

	// Check to see if this person is in the game
	normalizedTargetUsername := util.NormalizeString(d.targetUsername)
	for _, p := range t.Players {
		if normalizedTargetUsername == util.NormalizeString(p.Username) {
			// Record this player's user ID so that they cannot rejoin the table afterward
			t.kickedPlayers[p.UserID] = struct{}{}

			// Submit a request to remove them from the table
			m.Dispatcher.Tables.Leave(p.UserID, p.Username, t.ID)

			msg := fmt.Sprintf("Kicked \"%v\" from the game.", p.Username)
			m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
			return
		}
	}

	msg := fmt.Sprintf("\"%v\" is not joined to this game.", d.targetUsername)
	m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
}
