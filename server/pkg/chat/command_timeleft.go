package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /timeleft
func (m *Manager) commandTimeLeft(d *chatData, args []string, t dispatcher.TableManager) {
	var timeLeft string
	if v, err := m.Dispatcher.Core.GetShutdownTimeLeft(); err != nil {
		m.logger.Errorf("Failed to get the time left: %v", err)
		m.ChatServer(constants.DefaultErrorMsg, d.room)
		return
	} else {
		timeLeft = v
	}

	m.ChatServer(timeLeft, d.room)
}
