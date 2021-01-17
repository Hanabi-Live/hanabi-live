package table

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type suggestData struct {
	turn int
}

func (m *Manager) Suggest(turn int) {
	m.newRequest(requestTypeSuggest, &suggestData{ // nolint: errcheck
		turn: turn,
	})
}

func (m *Manager) suggest(data interface{}) {
	var d *suggestData
	if v, ok := data.(*suggestData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	if !m.table.Replay {
		m.Dispatcher.Chat.ChatServer(constants.NotReplayFail, m.table.getRoomName())
		return
	}

	if d.turn > m.table.Game.EndTurn {
		msg := fmt.Sprintf(
			"The turn of %v is not valid. (There are only %v turns in this game.)",
			d.turn,
			m.table.Game.EndTurn,
		)
		m.Dispatcher.Chat.ChatServer(msg, m.table.getRoomName())
	}

	// The logic for this command is handled client-side
}
