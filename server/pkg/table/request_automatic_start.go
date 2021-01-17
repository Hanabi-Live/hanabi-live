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

	// If they did not specify the number of players,
	// automatically start the game when the next player joins
	if d.numPlayers == 0 {
		d.numPlayers = len(m.table.Players) + 1
	}

	if m.table.Running {
		m.Dispatcher.Chat.ChatServer(constants.StartedFail, m.table.getRoomName())
		return
	}

	if d.userID != m.table.OwnerID {
		m.Dispatcher.Chat.ChatServer(constants.NotOwnerFail, m.table.getRoomName())
		return
	}

	if len(m.table.Players) == d.numPlayers {
		m.Start(d.userID)
	} else {
		m.table.automaticStart = d.numPlayers
		msg := fmt.Sprintf("The game will start as soon as %v players have joined.", d.numPlayers)
		m.Dispatcher.Chat.ChatServer(msg, m.table.getRoomName())
	}
}
