package chat

import (
	"fmt"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

const (
	maxMinutesToWait = 10
)

// nolint: godot
// /startin [minutes]
func (m *Manager) commandStartIn(d *commandData, t dispatcher.TableManager) {
	if t == nil || d.room == constants.Lobby {
		m.ChatServer(constants.NotInGameFail, d.room)
		return
	}

	// Validate the amount of minutes to wait
	if len(d.args) != 1 {
		msg := "You must specify the amount of minutes to wait. (e.g. \"/startin 1\")"
		m.ChatServer(msg, d.room)
	}

	var minutesToWait float64
	if v, err := strconv.ParseFloat(d.args[0], 64); err != nil {
		msg := fmt.Sprintf("\"%v\" is not a valid number.", d.args[0])
		m.ChatServer(msg, d.room)
		return
	} else {
		minutesToWait = v
	}

	if minutesToWait <= 0 {
		msg := "The minutes to wait must be greater than 0."
		m.ChatServer(msg, d.room)
		return
	}

	if minutesToWait > maxMinutesToWait {
		msg := fmt.Sprintf("The minutes to wait cannot be greater than %v.", maxMinutesToWait)
		m.ChatServer(msg, d.room)
		return
	}

	t.StartIn(d.userID, minutesToWait)
}
