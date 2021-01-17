package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /doc
func (m *Manager) commandDoc(d *commandData, t dispatcher.TableManager) {
	msg := "The strategy reference for the Hyphen-ated group: https://github.com/Zamiell/hanabi-conventions/blob/master/Reference.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	m.ChatServer(msg, d.room)
}
