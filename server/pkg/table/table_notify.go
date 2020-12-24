package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/options"
)

// ---------------------------------------
// Notifications before a game has started
// ---------------------------------------

type GameData struct {
	TableID           int               `json:"tableID"`
	Name              string            `json:"name"`
	Owner             int               `json:"owner"`
	Players           []*GamePlayerData `json:"players"`
	Options           *options.Options  `json:"options"`
	PasswordProtected bool              `json:"passwordProtected"`
}

type GamePlayerData struct {
	Index   int           `json:"index"`
	Name    string        `json:"name"`
	You     bool          `json:"you"`
	Present bool          `json:"present"`
	Stats   *pregameStats `json:"stats"`
}

// NotifyPlayerChange sends the people in the pre-game an update about the new amount of players.
// This is only called in situations where the game has not started yet.
func (m *Manager) NotifyPlayerChange() {
	if m.table.Running {
		m.logger.Error("The \"NotifyPlayerChange()\" method was called on a game that has already started.")
		return
	}

	for _, p := range m.table.Players {
		if !p.Present {
			continue
		}

		// First, make the array that contains information about all of the players in the game
		gamePlayers := make([]*GamePlayerData, 0)
		for j, p2 := range m.table.Players {
			gamePlayer := &GamePlayerData{
				Index:   j,
				Name:    p2.Username,
				You:     p.UserID == p2.UserID,
				Present: p2.Present,
				Stats:   p2.Stats,
			}
			gamePlayers = append(gamePlayers, gamePlayer)
		}

		// Second, send information about the game and the players in one big message
		m.Dispatcher.Sessions.NotifyGame(p.UserID, &GameData{
			TableID:           m.table.ID,
			Name:              m.table.Name,
			Owner:             m.table.OwnerID,
			Players:           gamePlayers,
			Options:           m.table.Options,
			PasswordProtected: m.table.PasswordHash != "",
		})
	}
}
