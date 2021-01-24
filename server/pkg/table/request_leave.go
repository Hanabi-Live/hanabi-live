package table

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type leaveData struct {
	userID         int
	username       string
	resultsChannel chan *LeaveReturnData
}

type LeaveReturnData struct {
	Ok     bool
	Delete bool
}

// Leave will request the given user to leave the table (which must be in a pre-game state).
// It returns whether or not the request was successful.
func (m *Manager) Leave(userID int, username string) *LeaveReturnData {
	resultsChannel := make(chan *LeaveReturnData)

	if err := m.newRequest(requestTypeLeave, &leaveData{
		userID:         userID,
		username:       username,
		resultsChannel: resultsChannel,
	}); err != nil {
		return &LeaveReturnData{
			Ok:     false,
			Delete: false,
		}
	}

	return <-resultsChannel
}

func (m *Manager) leave(data interface{}) {
	var d *leaveData
	if v, ok := data.(*leaveData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table
	i := t.getPlayerIndexFromID(d.userID)

	if !m.leaveValidate(d, i) {
		d.resultsChannel <- &LeaveReturnData{
			Ok:     false,
			Delete: false,
		}
		return
	}

	t.Players = append(t.Players[:i], t.Players[i+1:]...)

	m.logger.Infof(
		"%v - %v left. (There are now %v players.)",
		t.getName(),
		util.PrintUserCapitalized(d.userID, d.username),
		len(t.Players)-1,
	)

	// Update the table row in the lobby
	m.notifyTable()

	// Send the players in the game a message about the new player
	m.notifyPlayerChanged()

	// Update the status of this player and send everyone a message
	m.Dispatcher.Sessions.SetStatus(d.userID, constants.StatusLobby, t.ID)

	// Make the client switch screens to show the base lobby
	m.Dispatcher.Sessions.NotifyTableLeft(d.userID, t.ID)

	// If they were typing, remove the message
	m.notifyStopTyping(d.username)

	// If there is an automatic start countdown, cancel it
	if !t.datetimePlannedStart.IsZero() {
		t.datetimePlannedStart = time.Time{} // Assign a zero value
		msg := "Automatic game start has been canceled."
		m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
	}

	// Delete the table if this was the last person to leave
	// Or, force everyone else to leave if it was the owner that left
	if len(t.Players) == 0 || d.userID == t.OwnerID {
		d.resultsChannel <- &LeaveReturnData{
			Ok:     true,
			Delete: true,
		}
		return
	}

	// The leave was successful, but keep the table open
	d.resultsChannel <- &LeaveReturnData{
		Ok:     true,
		Delete: false,
	}
}

func (m *Manager) leaveValidate(d *leaveData, i int) bool {
	// Local variables
	t := m.table

	// Validate that they are joined to the table
	if i == -1 {
		// The tables manager should detect if a user is joined this table via the relationship map
		// Thus, if we are getting here, the table must have become desynchronized with the tables
		// manager
		m.logger.Errorf(
			"%v - Failed to leave %v, since they were not joined.",
			t.getName(),
			util.PrintUser(d.userID, d.username),
		)
		return false
	}

	// Validate that the game has not started
	if t.Running {
		msg := "That game has already started, so you cannot leave it."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that it is not a replay
	if t.Replay {
		msg := "You can not leave a replay. (You must unspectate it.)"
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	return true
}
