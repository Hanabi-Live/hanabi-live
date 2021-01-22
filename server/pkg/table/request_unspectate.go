package table

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

type unspectateData struct {
	userID         int
	username       string
	resultsChannel chan bool
}

// Unspectate requests that the user is removed from being a spectator (in either an ongoing game or
// a replay). It returns whether or not the table should be deleted afterwards.
func (m *Manager) Unspectate(userID int, username string) (bool, error) {
	resultsChannel := make(chan bool)

	if err := m.newRequest(requestTypeUnspectate, &unspectateData{
		userID:         userID,
		username:       username,
		resultsChannel: resultsChannel,
	}); err != nil {
		return false, err
	}

	result := <-resultsChannel
	return result, nil
}

func (m *Manager) unspectate(data interface{}) {
	var d *unspectateData
	if v, ok := data.(*unspectateData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table
	j := t.getSpectatorIndexFromID(d.userID)

	// Validate that they are spectating the table
	if j == -1 {
		// The tables manager should detect if a user is spectating this table via the relationship
		// map
		// Thus, if we are getting here, the table must have become desynchronized with the tables
		// manager
		m.logger.Errorf(
			"%v - Failed to unspectated %v, since they were not spectating.",
			t.getName(),
			util.PrintUser(d.userID, d.username),
		)
		d.resultsChannel <- false
		return
	}

	// If they were typing, remove the message
	m.notifyAllStopTyping(d.username)

	// If this is an ongoing game, create a list of any notes that they wrote
	cardOrderList := make([]int, 0)
	if !t.Replay {
		sp := t.spectators[j]
		for i, note := range sp.notes {
			if note != "" {
				cardOrderList = append(cardOrderList, i)
			}
		}
	}

	// Remove them
	t.spectators = append(t.spectators[:j], t.spectators[j+1:]...)

	m.logger.Infof(
		"%v - %v unspectated. (There are now %v spectators.)",
		t.getName(),
		util.PrintUserCapitalized(d.userID, d.username),
		len(t.spectators),
	)

	// Update the table row in the lobby
	m.notifyTable()

	// Update the in-game spectator list
	m.notifySpectatorsChanged()

	// Update the status of this player and send everyone a message
	m.Dispatcher.Sessions.SetStatus(d.userID, constants.StatusPregame, t.ID)

	if !t.Replay && len(cardOrderList) > 0 {
		// Since this is a spectator leaving an ongoing game, all of their notes will be deleted
		// Send the other spectators a message about the new list of notes, if any
		for _, order := range cardOrderList {
			m.notifySpectatorsNote(order)
		}
	}

	if t.Replay && len(t.spectators) == 0 {
		m.logger.Infof("%v - Ending replay because everyone left.", t.getName())
		d.resultsChannel <- true
		return
	}

	d.resultsChannel <- false
}
