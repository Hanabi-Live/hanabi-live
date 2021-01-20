package table

import (
	"context"
	"fmt"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/types"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/alexedwards/argon2id"
)

type joinData struct {
	userID         int
	username       string
	password       string
	resultsChannel chan bool
}

const (
	numMaxPlayers = 6
)

// Join will request that the given user joins the table (which must be in a pre-game state).
// It will block until the player has successfully joined or not.
// It returns whether or not the join was successful.
func (m *Manager) Join(userID int, username string, password string) bool {
	resultsChannel := make(chan bool)

	m.newRequest(requestTypeJoin, &joinData{ // nolint: errcheck
		userID:         userID,
		username:       username,
		password:       password,
		resultsChannel: resultsChannel,
	})

	return <-resultsChannel
}

func (m *Manager) join(data interface{}) {
	var d *joinData
	if v, ok := data.(*joinData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table

	if !m.joinValidate(d) {
		d.resultsChannel <- false
		return
	}

	var numGames int
	var variantStats *models.UserStatsRow
	if v1, v2, ok := m.joinGetStats(d.userID, d.username); !ok {
		msg := "Something went wrong when getting your stats. Please contact an administrator."
		m.Dispatcher.Sessions.NotifyError(d.userID, msg)
		d.resultsChannel <- false
		return
	} else {
		numGames = v1
		variantStats = v2
	}

	p := &player{
		UserID:   d.userID,
		Username: d.username,
		Present:  true,
		Stats: &types.PregameStats{
			NumGames: numGames,
			Variant:  variantStats,
		},
		Typing:    false,
		LastTyped: time.Now(),
	}

	t.Players = append(t.Players, p)

	m.logger.Infof(
		"%v - %v joined. (There are now %v players.)",
		t.getName(),
		util.PrintUserCapitalized(d.userID, d.username),
		len(t.Players),
	)

	// Update the table row in the lobby
	m.notifyTable()

	// Send the players in the game a message about the new player
	m.notifyPlayerChanged()

	// Update the status of this player and send everyone a message
	m.Dispatcher.Sessions.SetStatus(d.userID, constants.StatusPregame, t.ID)

	// Let this player know they successfully joined the table
	m.Dispatcher.Sessions.NotifyJoined(d.userID, t.ID)

	// Send them the chat history for this game
	m.Dispatcher.Sessions.NotifyChatListFromTable(
		d.userID,
		t.getRoomName(),
		t.Chat,
		t.ChatRead[d.userID],
	)

	// Mark them as having read all of the chat
	t.ChatRead[d.userID] = len(t.Chat)

	// Send them messages for people typing, if any
	for _, p := range t.Players {
		if p.Typing {
			m.Dispatcher.Sessions.NotifyChatTyping(d.userID, t.ID, p.Username, p.Typing)
		}
	}

	// Update the "DatetimeLastJoined" field, but make a copy first
	datetimeLastJoined := t.DatetimeLastJoined
	t.DatetimeLastJoined = time.Now()

	// Play a notification sound if it has been more than 15 seconds since the last person joined
	if time.Since(datetimeLastJoined) > time.Second*15 {
		for _, p2 := range t.Players {
			// Skip sending a message to the player that just joined
			if p2.UserID != d.userID {
				m.Dispatcher.Sessions.NotifySoundLobby(p2.UserID, "someone_joined")
			}
		}
	}

	// If there is an automatic start countdown, cancel it
	if !t.DatetimePlannedStart.IsZero() {
		t.DatetimePlannedStart = time.Time{} // Assign a zero value
		msg := "Automatic game start has been canceled."
		m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
	}

	// If the user previously requested it, automatically start the game
	if m.joinCheckAutomaticStart() {
		m.start(&startData{
			userID: t.ID,
		})
	}

	d.resultsChannel <- true
}

func (m *Manager) joinValidate(d *joinData) bool {
	// Local variables
	t := m.table

	// Validate that this table is not full
	if len(t.Players) >= numMaxPlayers {
		msg := fmt.Sprintf(
			"That table is already full. (You can not play with more than %v players.)",
			numMaxPlayers,
		)
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that the game is not started yet
	if t.Running {
		msg := "That game has already started, so you cannot join it."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that it is not a replay
	if t.Replay {
		msg := "You can not join a replay."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	// Validate that they entered the correct password
	if t.PasswordHash != "" {
		if match, err := argon2id.ComparePasswordAndHash(
			d.password,
			t.PasswordHash,
		); err != nil {
			m.logger.Errorf("Failed to compare the submitted password to the Argon2 hash: %v", err)
			m.Dispatcher.Sessions.NotifyError(d.userID, constants.DefaultErrorMsg)
			return false
		} else if !match {
			msg := "That is not the correct password for this game."
			m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
			return false
		}
	}

	// Validate that they have not been previously kicked from this game
	if _, ok := t.kickedPlayers[d.userID]; ok {
		msg := "You cannot join a game that you have been kicked from."
		m.Dispatcher.Sessions.NotifyWarning(d.userID, msg)
		return false
	}

	return true
}

func (m *Manager) joinGetStats(userID int, username string) (int, *models.UserStatsRow, bool) {
	// Local variables
	t := m.table

	// Get the total number of non-speedrun games that this player has played
	var numGames int
	if v, err := m.models.Games.GetUserNumGames(context.Background(), userID, false); err != nil {
		m.logger.Errorf(
			"Failed to get the number of non-speedrun games for %v: %v",
			util.PrintUser(userID, username),
			err,
		)
		return 0, nil, false
	} else {
		numGames = v
	}

	// Get the variant-specific stats for this player
	var variantStats *models.UserStatsRow
	if v, err := m.models.UserStats.Get(
		context.Background(),
		userID,
		t.Options.VariantID,
	); err != nil {
		m.logger.Errorf(
			"Failed to get the stats for %v for variant %v: %v",
			util.PrintUser(userID, username),
			t.Options.VariantID,
			err,
		)
		return 0, nil, false
	} else {
		variantStats = v
	}

	return numGames, variantStats, true
}

func (m *Manager) joinCheckAutomaticStart() bool {
	// Local variables
	t := m.table

	if t.automaticStart != len(t.Players) {
		return false
	}

	// Check to see if the owner is present
	owner := t.getOwner()
	if owner == nil {
		m.logger.Error("Failed to find the owner of the game when attempting to automatically start it.")
		return false
	}
	if !owner.Present {
		msg := "Aborting automatic game start since the table creator is away."
		m.Dispatcher.Chat.ChatServer(msg, t.getRoomName())
		return false
	}

	return true
}
