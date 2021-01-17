package table

import (
	"math/rand"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type impostorData struct {
	userID int
}

func (m *Manager) Impostor(userID int) {
	m.newRequest(requestTypeImpostor, &impostorData{ // nolint: errcheck
		userID: userID,
	})
}

func (m *Manager) impostor(data interface{}) {
	var d *impostorData
	if v, ok := data.(*impostorData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	if m.table.Running {
		m.Dispatcher.Chat.ChatServer(constants.NotStartedFail, m.table.getRoomName())
		return
	}

	if d.userID != m.table.OwnerID {
		m.Dispatcher.Chat.ChatServer(constants.NotOwnerFail, m.table.getRoomName())
		return
	}

	util.SetSeedFromString(m.table.Game.Seed)      // Seed the random number generator
	randomIndex := rand.Intn(len(m.table.Players)) // nolint: gosec

	for i, p := range m.table.Players {
		var msg string
		if i == randomIndex {
			msg = "You are an IMPOSTOR."
		} else {
			msg = "You are a CREWMATE."
		}

		m.Dispatcher.Sessions.NotifyChatServer(p.UserID, msg, m.table.getRoomName())
	}
}
