package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /new
func (m *Manager) commandNew(d *commandData, t dispatcher.TableManager) {
	msg := "If you are looking to \"get into\" the game and spend a lot of time to play with experienced players, the Hyphen-ated group is always looking for more members. To start with, please read the beginners guide, which goes over how we play and how to join our next game: https://github.com/Zamiell/hanabi-conventions/blob/master/Beginner.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	m.ChatServer(msg, d.room)
}
