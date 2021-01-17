package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /discord
func (m *Manager) commandDiscord(d *chatData, args []string, t dispatcher.TableManager) {
	msg := "Join the Discord server: https://discord.gg/FADvkJp"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	m.ChatServer(msg, d.room)
}
