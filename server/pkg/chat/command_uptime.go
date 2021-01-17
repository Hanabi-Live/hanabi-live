package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /uptime
func (m *Manager) commandUptime(d *chatData, args []string, t dispatcher.TableManager) {
	cameOnline := m.Dispatcher.Core.GetCameOnline()
	m.ChatServer(cameOnline, d.room)

	var uptime string
	if v, err := m.Dispatcher.Core.GetUptime(); err != nil {
		m.logger.Errorf("Failed to get the uptime: %v", err)
		m.ChatServer(constants.DefaultErrorMsg, d.room)
		return
	} else {
		uptime = v
	}
	m.ChatServer(uptime, d.room)
}
