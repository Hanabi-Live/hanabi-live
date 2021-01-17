package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /bga
func (m *Manager) commandBGA(d *chatData, args []string, t dispatcher.TableManager) {
	msg := "If you have experience playing with the Board Game Arena convention framework and you are interested in playing with the Hyphen-ated group, then read this: https://github.com/Zamiell/hanabi-conventions/blob/master/misc/BGA.md"
	// (we can't put "<" or ">" around the link because then it won't display properly in the lobby)
	m.ChatServer(msg, d.room)
}
