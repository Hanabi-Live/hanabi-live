package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

// nolint: godot
// /replay [databaseID] [turn]
func (m *Manager) commandReplay(d *chatData, args []string, t dispatcher.TableManager) {
	msg := util.GetReplayURL(m.domain, m.useTLS, args)
	m.ChatServer(msg, d.room)
}
