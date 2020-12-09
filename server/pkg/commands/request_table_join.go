package commands

import (
	"context"
	"strings"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
	"github.com/Zamiell/hanabi-live/server/pkg/models"
	"github.com/Zamiell/hanabi-live/server/pkg/util"
	"github.com/alexedwards/argon2id"
)

// commandTableJoin is sent when the user clicks on the "Join" button in the lobby
//
// Example data:
// {
//   tableID: 15103,
// }
func commandTableJoin(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
	}

	// Validate that the player is not already joined to this table
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	if playerIndex != -1 {
		s.Warning("You have already joined this table.")
		return
	}

	// Validate that this table does not already have 6 players
	if len(t.Players) >= 6 {
		s.Warning("That table is already full. (You can not play with more than 6 players.)")
		return
	}

	// Validate that the game is not started yet
	if t.Running {
		s.Warning("That game has already started, so you cannot join it.")
		return
	}

	// Validate that it is not a replay
	if t.Replay {
		s.Warning("You can not join a replay.")
		return
	}

	// Validate that they entered the correct password
	if t.PasswordHash != "" {
		if match, err := argon2id.ComparePasswordAndHash(d.Password, t.PasswordHash); err != nil {
			hLog.Errorf("Failed to compare the submitted password to the Argon2 hash: %v", err)
			s.Error(DefaultErrorMsg)
			return
		} else if !match {
			s.Warning("That is not the correct password for this game.")
			return
		}
	}

	// Validate that they have not been previously kicked from this game
	if _, ok := t.KickedPlayers[s.UserID]; ok {
		s.Warning("You cannot join a game that you have been kicked from.")
		return
	}

	tableJoin(ctx, s, d, t)
}

func tableJoin(ctx context.Context, s *Session, d *CommandData, t *Table) {
	// Local variables
	variant := variants[t.Options.VariantName]

	// Since this is a function that changes a user's relationship to tables,
	// we must acquires the tables lock to prevent race conditions
	if !d.NoTablesLock {
		tables.Lock(ctx)
		defer tables.Unlock(ctx)
	}

	// Validate that the player is not joined to any table
	// (this cannot be in the "commandTableJoin()" function because we need the tables lock)
	// (only bots have the ability to join more than one table)
	if !strings.HasPrefix(s.Username, "Bot-") {
		if len(tables.GetTablesUserPlaying(s.UserID)) > 0 {
			s.Warning("You cannot join more than one table at a time. Terminate your other game before joining a new one.")
			return
		}
	}

	// Get the total number of non-speedrun games that this player has played
	var numGames int
	if v, err := models.Games.GetUserNumGames(s.UserID, false); err != nil {
		hLog.Errorf(
			"Failed to get the number of non-speedrun games for %v: %v",
			util.PrintUser(s.UserID, s.Username),
			err,
		)
		s.Error("Something went wrong when getting your stats. Please contact an administrator.")
		return
	} else {
		numGames = v
	}

	// Get the variant-specific stats for this player
	var variantStats *UserStatsRow
	if v, err := models.UserStats.Get(s.UserID, variant.ID); err != nil {
		hLog.Errorf(
			"Failed to get the stats for %v for variant %v: %v",
			util.PrintUser(s.UserID, s.Username),
			variant.ID,
			err,
		)
		s.Error("Something went wrong when getting your stats. Please contact an administrator.")
		return
	} else {
		variantStats = v
	}

	hLog.Infof(
		"%v %v joined. (There are now %v players.)",
		t.GetName(),
		util.PrintUserCapitalized(s.UserID, s.Username),
		len(t.Players)+1,
	)

	p := &Player{
		UserID:  s.UserID,
		Name:    s.Username,
		Session: s,
		Present: true,
		Stats: &PregameStats{
			NumGames: numGames,
			Variant:  variantStats,
		},
		Typing:    false,
		LastTyped: time.Time{},
	}

	t.Players = append(t.Players, p)
	tables.AddPlaying(s.UserID, t.ID) // Keep track of user to table relationships

	notifyAllTable(t)
	t.NotifyPlayerChange()

	// Set their status
	s.SetStatus(constants.StatusPregame)
	s.SetTableID(t.ID)
	notifyAllUser(s)

	// Let the client know they successfully joined the table
	s.NotifyTableJoined(t)

	// Send them the chat history for this game
	chatSendPastFromTable(s, t)
	t.ChatRead[p.UserID] = len(t.Chat)

	// Send them messages for people typing, if any
	for _, p := range t.Players {
		if p.Typing {
			s.NotifyChatTyping(t, p.Name, p.Typing)
		}
	}

	// If there is an automatic start countdown, cancel it
	if !t.DatetimePlannedStart.IsZero() {
		t.DatetimePlannedStart = time.Time{} // Assign a zero value
		msg := "Automatic game start has been canceled."
		chatServerSend(ctx, msg, t.GetRoomName(), true)
	}

	// If the user previously requested it, automatically start the game
	if t.AutomaticStart == len(t.Players) {
		// Check to see if the owner is present
		for _, p2 := range t.Players {
			if p2.UserID == t.OwnerID {
				if !p2.Present {
					msg := "Aborting automatic game start since the table creator is away."
					chatServerSend(ctx, msg, t.GetRoomName(), true)
					return
				}

				commandTableStart(ctx, p2.Session, &CommandData{ // nolint: exhaustivestruct
					TableID:      t.ID,
					NoTableLock:  true,
					NoTablesLock: true,
				})
				return
			}
		}

		hLog.Error("Failed to find the owner of the game when attempting to automatically start it.")
		return
	}

	// Update the "DatetimeLastJoined" field, but make a copy first
	datetimeLastJoined := t.DatetimeLastJoined
	t.DatetimeLastJoined = time.Now()

	// Play a notification sound if it has been more than 15 seconds since the last person joined
	if time.Since(datetimeLastJoined) > time.Second*15 {
		for _, p2 := range t.Players {
			// Skip sending a message to the player that just joined
			if p2.UserID != p.UserID {
				p2.Session.NotifySoundLobby("someone_joined")
			}
		}
	}
}
