package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /unpause
func (m *Manager) commandUnpause(d *chatData, args []string, t dispatcher.TableManager) {
	if t == nil || d.room == constants.Lobby {
		m.ChatServer(constants.NotInGameFail, d.room)
		return
	}

	t.Pause(d.userID, "unpause")
}
