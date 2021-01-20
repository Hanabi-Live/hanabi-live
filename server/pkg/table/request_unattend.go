package table

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type unattendData struct {
	userID   int
	username string
}

// Unattend requests that a user playing in an ongoing game is marked as being disconnected.
func (m *Manager) Unattend(userID int, username string) {
	m.newRequest(requestTypeUnattend, &unattendData{ // nolint: errcheck
		userID:   userID,
		username: username,
	})
}

func (m *Manager) unattend(data interface{}) {
	var d *unattendData
	if v, ok := data.(*unattendData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table

	// Validate that the game is not a replay
	if t.Replay {
		m.Dispatcher.Sessions.NotifyWarning(d.userID, "You cannot unattend a replay.")
		return
	}

	// Validate that they are playing the game
	i := t.getPlayerIndexFromID(d.userID)
	if i == -1 {
		msg := fmt.Sprintf("You are not playing at table %v, so you cannot unattend it.", t.ID)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return
	}

	// Set their "present" variable to false, which will turn their name red
	// (or set them to "AWAY" if the game has not started yet)
	p := t.Players[i]
	p.Present = false

	// If they were typing, remove the message
	m.notifyAllStopTyping(d.username)

	// Update the status of this player and send everyone a message
	m.Dispatcher.Sessions.SetStatus(d.userID, constants.StatusPregame, t.ID)
}
