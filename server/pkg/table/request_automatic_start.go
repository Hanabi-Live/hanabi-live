package table

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type automaticStartData struct {
	userID     int
	numPlayers int
}

func (m *Manager) AutomaticStart(userID int, numPlayers int) {
	m.newRequest(requestTypeAutomaticStart, &automaticStartData{ // nolint: errcheck
		userID:     userID,
		numPlayers: numPlayers,
	})
}

func (m *Manager) automaticStart(data interface{}) {
	var d *automaticStartData
	if v, ok := data.(*automaticStartData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table

	// If they did not specify the number of players,
	// automatically start the game when the next player joins
	if d.numPlayers == 0 {
		d.numPlayers = len(t.Players) + 1
	}

	if t.Running {
		m.Dispatcher.Chat.ChatServer(constants.StartedFail, t.getRoomName())
		return
	}

	if d.userID != t.OwnerID {
		m.Dispatcher.Chat.ChatServer(constants.NotOwnerFail, t.getRoomName())
		return
	}

	if len(t.Players) == d.numPlayers {
		m.Start(d.userID)
	} else {
		t.automaticStart = d.numPlayers
		msg := fmt.Sprintf("The game will start as soon as %v players have joined.", d.numPlayers)
		m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
	}
}
