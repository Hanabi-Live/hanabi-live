package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /efficiency
func (m *Manager) commandEfficiency(d *chatData, args []string, t dispatcher.TableManager) {
	msg := "Info on efficiency calculation: https://github.com/Zamiell/hanabi-conventions/blob/master/misc/Efficiency.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	m.ChatServer(msg, d.room)
}
