package table

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type spectateData struct {
	userID               int
	username             string
	shadowingPlayerIndex int
	resultsChannel       chan bool
}

// Spectate requests that the user is added as a spectator (in either an ongoing game or a replay).
// It returns whether or not the request was successful.
func (m *Manager) Spectate(userID int, username string, shadowingPlayerIndex int) bool {
	resultsChannel := make(chan bool)

	if err := m.newRequest(requestTypeSpectate, &spectateData{
		userID:               userID,
		username:             username,
		shadowingPlayerIndex: shadowingPlayerIndex,
		resultsChannel:       resultsChannel,
	}); err != nil {
		return false
	}

	return <-resultsChannel
}

func (m *Manager) spectate(data interface{}) {
	var d *spectateData
	if v, ok := data.(*spectateData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table
	g := t.Game

	if !m.spectateValidate(d) {
		d.resultsChannel <- false
		return
	}

	sp := &spectator{
		userID:               d.userID,
		username:             d.username,
		typing:               false,
		lastTyped:            time.Now(),
		shadowingPlayerIndex: d.shadowingPlayerIndex,
		notes:                make([]string, g.getNotesSize()),
	}
	t.spectators = append(t.spectators, sp)

	var verb string
	if t.Replay {
		verb = "joined the replay"
	} else {
		verb = "spectated"
	}
	m.logger.Infof(
		"%v - %v %v.",
		t.getName(),
		util.PrintUserCapitalized(d.userID, d.username),
		verb,
	)

	// Update the table row in the lobby
	m.notifyTable()

	// Update the in-game spectator list
	m.notifySpectatorsChanged()

	// Update the status of this player and send everyone a message
	status := constants.StatusSpectating
	tableID := t.ID
	if t.Replay {
		if t.Visible {
			status = constants.StatusSharedReplay
		} else {
			status = constants.StatusReplay
			tableID = 0 // Protect the privacy of a user in a solo replay
		}
	}
	m.Dispatcher.Sessions.SetStatus(d.userID, status, tableID)

	// Send them a "tableStart" message
	// After the client receives the "tableStart" message, they will send a "getGameInfo1" command
	// to begin the process of loading the UI and putting them in the game
	m.Dispatcher.Sessions.NotifyTableStart(d.userID, t.ID)

	d.resultsChannel <- true
}

func (m *Manager) spectateValidate(d *spectateData) bool {
	// Local variables
	t := m.table
	i := m.table.getPlayerIndexFromID(d.userID)
	j := m.table.getSpectatorIndexFromID(d.userID)

	// Validate that the game has started
	if !t.Running {
		m.Dispatcher.Sessions.NotifyWarning(d.userID, constants.NotStartedFail)
		return false
	}

	// Validate that they are not playing at this table
	if !t.Replay && i != -1 {
		msg := "You cannot spectate a game that you are currently playing."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that they are not already spectating this table
	for j != -1 {
		msg := "You are already spectating this table."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate the shadowing player index
	// (if provided, they want to spectate from a specific player's perspective)
	if d.shadowingPlayerIndex != -1 {
		if d.shadowingPlayerIndex < 0 || d.shadowingPlayerIndex > len(t.Players)-1 {
			msg := "That is an invalid player index to shadow."
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	return true
}
