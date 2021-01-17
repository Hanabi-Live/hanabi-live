package chat

import (
	"fmt"
	"strconv"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/dispatcher"
)

// /s - Automatically start the game as soon as someone joins.
func (m *Manager) commandS(d *commandData, t dispatcher.TableManager) {
	numPlayers := 0 // This will be interpreted as the default value

	if len(d.args) > 0 {
		// They specified an argument, so use this as the number of players
		if v, err := strconv.Atoi(d.args[0]); err != nil {
			msg := fmt.Sprintf("\"%v\" is not an integer.", d.args[0])
			m.ChatServer(msg, d.room)
			return
		} else {
			numPlayers = v
		}

		if numPlayers < 2 || numPlayers > 6 {
			msg := "You can only start a table with 2 to 6 players."
			m.ChatServer(msg, d.room)
			return
		}
	}

	m.commandAutomaticStart(d, t, numPlayers)
}

// /s2 - Automatically start the game as soon as there are 2 players.
func (m *Manager) commandS2(d *commandData, t dispatcher.TableManager) {
	m.commandAutomaticStart(d, t, 2)
}

// /s3 - Automatically start the game as soon as there are 3 players.
func (m *Manager) commandS3(d *commandData, t dispatcher.TableManager) {
	m.commandAutomaticStart(d, t, 3)
}

// /s4 - Automatically start the game as soon as there are 4 players.
func (m *Manager) commandS4(d *commandData, t dispatcher.TableManager) {
	m.commandAutomaticStart(d, t, 4)
}

// /s5 - Automatically start the game as soon as there are 5 players.
func (m *Manager) commandS5(d *commandData, t dispatcher.TableManager) {
	m.commandAutomaticStart(d, t, 5)
}

// /s6 - Automatically start the game as soon as there are 6 players.
func (m *Manager) commandS6(d *commandData, t dispatcher.TableManager) {
	m.commandAutomaticStart(d, t, 6)
}

func (m *Manager) commandAutomaticStart(d *commandData, t dispatcher.TableManager, numPlayers int) {
	if t == nil || d.room == constants.Lobby {
		m.ChatServer(constants.NotInGameFail, d.room)
		return
	}

	t.AutomaticStart(d.userID, numPlayers)
}
