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

	// Local variables
	t := m.table
	g := t.Game

	if t.Running {
		m.Dispatcher.Chat.ChatServer(constants.NotStartedFail, t.getRoomName())
		return
	}

	if d.userID != t.OwnerID {
		m.Dispatcher.Chat.ChatServer(constants.NotOwnerFail, t.getRoomName())
		return
	}

	util.SetSeedFromString(g.Seed)           // Seed the random number generator
	randomIndex := rand.Intn(len(t.Players)) // nolint: gosec

	for i, p := range t.Players {
		var msg string
		if i == randomIndex {
			msg = "You are an IMPOSTOR."
		} else {
			msg = "You are a CREWMATE."
		}

		m.Dispatcher.Sessions.NotifyChatServer(p.UserID, msg, t.getRoomName())
	}
}
