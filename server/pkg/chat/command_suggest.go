package chat

import (
	"fmt"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// nolint: godot
// /suggest
func (m *Manager) commandSuggest(d *chatData, args []string, t dispatcher.TableManager) {
	if t == nil || d.room == constants.Lobby {
		m.ChatServer(constants.NotInGameFail, d.room)
		return
	}

	// Validate that they only sent one argument
	if len(args) != 1 {
		msg := "The format of the /suggest command is: /suggest [turn]"
		m.ChatServer(msg, d.room)
		return
	}

	// Validate that the argument is an integer
	turnString := args[0]
	var turn int
	if v, err := strconv.Atoi(turnString); err != nil {
		var msg string
		if _, err := strconv.ParseFloat(turnString, 64); err != nil {
			msg = fmt.Sprintf("\"%v\" is not an integer.", turn)
		} else {
			msg = "The /suggest command only accepts integers."
		}
		m.ChatServer(msg, d.room)
		return
	} else {
		turn = v
	}

	// Validate that the turn is sane
	if turn <= 0 {
		msg := fmt.Sprintf("The turn of %v is not valid.", turn)
		m.ChatServer(msg, d.room)
		return
	}

	t.Suggest(turn)
}
