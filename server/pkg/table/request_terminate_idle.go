package table

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type terminateIdleData struct {
	userID   int
	username string
}

func (m *Manager) TerminateIdle(userID int, username string) {
	m.newRequest(requestTypeTerminateNormal, &terminateIdleData{ // nolint: errcheck
		userID:   userID,
		username: username,
	})
}

func (m *Manager) terminateIdle(data interface{}) {
	var d *terminateIdleData
	if v, ok := data.(*terminateIdleData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table
	i := t.getPlayerIndexFromID(d.userID)

	if !t.Running {

	}

	// Validate that it is not a replay
	if t.Replay {
		msg := "You can not terminate a replay."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return
	}

	// Validate that they are in the game
	if i == -1 {
		msg := fmt.Sprintf("You are not playing at table %v, so you cannot terminate it.", t.ID)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return
	}

	m.action(&actionData{
		userID:     d.userID,
		username:   d.username,
		actionType: constants.ActionTypeEndGame,
		target:     i,
		value:      int(constants.EndConditionTerminated),
	})
}
