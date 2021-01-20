package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

// nolint: godot
// /replay [databaseID] [turn]
func (m *Manager) commandReplay(d *commandData, t dispatcher.TableManager) {
	msg := util.GetReplayURL(m.Dispatcher.HTTP.Domain(), m.Dispatcher.HTTP.UseTLS(), d.args)
	m.ChatServer(msg, d.room)
}
