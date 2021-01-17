package chat

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

func (m *Manager) commandKick(d *commandData, t dispatcher.TableManager) {
	if t == nil || d.room == constants.Lobby {
		m.ChatServer(constants.NotInGameFail, d.room)
		return
	}

	if len(d.args) != 1 {
		msg := "The format of the /kick command is: /kick [username]"
		m.ChatServer(msg, d.room)
		return
	}

	// Check to make sure that they are not targeting themself
	targetUsername := d.args[0]
	normalizedTargetUsername := util.NormalizeString(targetUsername)
	if normalizedTargetUsername == util.NormalizeString(d.username) {
		msg := "You cannot kick yourself."
		m.ChatServer(msg, d.room)
		return
	}

	t.Kick(d.userID, targetUsername)
}
