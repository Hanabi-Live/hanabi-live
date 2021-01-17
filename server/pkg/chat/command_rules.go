package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /rules
func (m *Manager) commandRules(d *commandData, t dispatcher.TableManager) {
	msg := "Please follow the community guidelines: https://github.com/Zamiell/hanabi-live/blob/master/docs/COMMUNITY_GUIDELINES.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	m.ChatServer(msg, d.room)
}
