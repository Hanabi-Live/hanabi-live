package sessions

import (
	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type notifyGameData struct {
	userID   int
	gameData *types.GameData
}

func (m *Manager) NotifyGame(userID int, gameData *types.GameData) {
	m.newRequest(requestTypeNotifyGame, &notifyGameData{ // nolint: errcheck
		userID:   userID,
		gameData: gameData,
	})
}

func (m *Manager) notifyGame(data interface{}) {
	var d *notifyGameData
	if v, ok := data.(*notifyGameData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.send(d.userID, "game", d.gameData)
}
