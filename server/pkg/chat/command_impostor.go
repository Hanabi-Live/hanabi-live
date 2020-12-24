package chat

import (
	"math/rand"
	"time"
)

func (m *Manager) commandImpostor() {
	if t == nil || d.Room == "lobby" {
		chatServerSend(ctx, NotInGameFail, d.Room, d.NoTablesLock)
		return
	}

	if t.Running {
		chatServerSend(ctx, NotStartedFail, d.Room, d.NoTablesLock)
		return
	}

	if s.UserID != t.OwnerID {
		chatServerSend(ctx, NotOwnerFail, d.Room, d.NoTablesLock)
		return
	}

	randomIndex := rand.Intn(len(t.Players)) // nolint: gosec

	for i, p := range t.Players {
		var msg string
		if i == randomIndex {
			msg = "You are an IMPOSTOR."
		} else {
			msg = "You are a CREWMATE."
		}

		// TODO replace with helper function
		chatMessage := &ChatMessage{
			Msg:       msg,
			Who:       WebsiteName,
			Discord:   false,
			Server:    true,
			Datetime:  time.Now(),
			Room:      d.Room,
			Recipient: p.Session.Username,
		}
		p.Session.Emit("chat", chatMessage)
	}
}
