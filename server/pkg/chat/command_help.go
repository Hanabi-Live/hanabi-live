package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /help
func (m *Manager) commandHelp(d *commandData, t dispatcher.TableManager) {
	msg := "You can see the list of chat commands here: https://github.com/Zamiell/hanabi-live/blob/master/docs/CHAT_COMMANDS.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	m.ChatServer(msg, d.room)
}
