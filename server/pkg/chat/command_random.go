package chat

import (
	"fmt"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

// nolint: godot
// /random [min] [max]
func (m *Manager) commandRandom(d *chatData, args []string, t dispatcher.TableManager) {
	// We expect something like "/random 2" or "/random 1 2"
	if len(args) != 1 && len(args) != 2 {
		msg := "The format of the /random command is: /random [min] [max]"
		m.ChatServer(msg, d.room)
		return
	}

	// Ensure that both arguments are numbers
	var arg1, arg2 int
	if v, err := strconv.Atoi(args[0]); err != nil {
		if _, err := strconv.ParseFloat(args[0], 64); err != nil {
			msg := fmt.Sprintf("\"%v\" is not an integer.", args[0])
			m.ChatServer(msg, d.room)
		} else {
			msg := "The /random command only accepts integers."
			m.ChatServer(msg, d.room)
		}
		return
	} else {
		arg1 = v
	}
	if len(args) == 2 { // nolint: gomnd
		if v, err := strconv.Atoi(args[1]); err != nil {
			if _, err := strconv.ParseFloat(args[1], 64); err != nil {
				msg := fmt.Sprintf("\"%v\" is not an integer.", args[1])
				m.ChatServer(msg, d.room)
			} else {
				msg := "The /random command only accepts integers."
				m.ChatServer(msg, d.room)
			}
			return
		} else {
			arg2 = v
		}
	}

	// Assign min and max, depending on how many arguments were passed
	var min, max int
	if len(args) == 1 {
		min = 1
		max = arg1
	} else if len(args) == 2 { // nolint: gomnd
		min = arg1
		max = arg2
	}

	// Do a sanity check
	if min == max {
		msg := fmt.Sprintf(
			"%v is equal to %v, so that request is nonsensical.",
			min,
			max,
		)
		m.ChatServer(msg, d.room)
		return
	}
	// (if min >= max, the "util.GetRandom()" function will swap them)

	randNum := util.GetRandom(min, max)
	msg := fmt.Sprintf("Random number between %v and %v: %v", min, max, randNum)
	m.ChatServer(msg, d.room)
}
