package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// /findvariant
// This function does not consider modifiers (e.g. "Empty Clues").
func (m *Manager) commandFindVariant(d *chatData, args []string, t dispatcher.TableManager) {
	if t == nil || d.room == constants.Lobby {
		m.ChatServer(constants.NotInGameFail, d.room)
		return
	}

	t.FindVariant()
}
