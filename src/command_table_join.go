package main

import (
	"strconv"
	"time"

	"github.com/alexedwards/argon2id"
)

// commandTableJoin is sent when the user clicks on the "Join" button in the lobby
//
// Example data:
// {
//   tableID: 15103,
// }
func commandTableJoin(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the table exists
	tableID := d.TableID
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that the player is not already joined to this table
	i := t.GetPlayerIndexFromID(s.UserID())
	if i != -1 {
		s.Warning("You have already joined this table.")
		return
	}

	// Validate that the player is not joined to another table
	if t2 := s.GetJoinedTable(); t2 != nil {
		s.Warning("You cannot join more than one table at a time. " +
			"Terminate your old game before joining a new one.")
		return
	}

	// Validate that this table does not already have 6 players
	if len(t.Players) >= 6 {
		s.Warning("That table already has 6 players.")
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
			logger.Error("Failed to compare the submitted password to the Argon2 hash:", err)
			s.Error(DefaultErrorMsg)
			return
		} else if !match {
			s.Warning("That is not the correct password for this game.")
			return
		}
	}

	/*
		Join
	*/

	logger.Info(t.GetName() + "User \"" + s.Username() + "\" joined. " +
		"(There are now " + strconv.Itoa(len(t.Players)+1) + " players.)")

	// Get the total number of non-speedrun games that this player has played
	var numGames int
	if v, err := models.Games.GetUserNumGames(s.UserID(), false); err != nil {
		logger.Error("Failed to get the number of non-speedrun games for player "+
			"\""+s.Username()+"\":", err)
		s.Error("Something went wrong when getting your stats. Please contact an administrator.")
		return
	} else {
		numGames = v
	}

	// Get the variant-specific stats for this player
	var variantStats UserStatsRow
	if v, err := models.UserStats.Get(s.UserID(), variants[t.Options.Variant].ID); err != nil {
		logger.Error("Failed to get the stats for player \""+s.Username()+"\" "+
			"for variant "+strconv.Itoa(variants[t.Options.Variant].ID)+":", err)
		s.Error("Something went wrong when getting your stats. Please contact an administrator.")
		return
	} else {
		variantStats = v
	}

	p := &Player{
		ID:      s.UserID(),
		Name:    s.Username(),
		Session: s,
		Present: true,
		Stats: PregameStats{
			NumGames: numGames,
			Variant:  variantStats,
		},
	}
	t.Players = append(t.Players, p)
	notifyAllTable(t)
	t.NotifyPlayerChange()

	// Set their status
	if s != nil {
		s.Set("status", StatusPregame)
		notifyAllUser(s)
	}

	// Send them a "joined" message
	// (to let them know they successfully joined the table)
	type JoinedMessage struct {
		TableID int `json:"tableID"`
	}
	s.Emit("joined", &JoinedMessage{
		TableID: tableID,
	})

	// Send them the chat history for this game
	chatSendPastFromTable(s, t)
	t.ChatRead[p.ID] = 0

	// Send them messages for people typing, if any
	for _, p := range t.Players {
		if p.Typing {
			s.NotifyChatTyping(p.Name, p.Typing)
		}
	}

	// If there is an automatic start countdown, cancel it
	if !t.DatetimePlannedStart.IsZero() {
		t.DatetimePlannedStart = time.Time{} // Assign a zero value
		room := "table" + strconv.Itoa(t.ID)
		chatServerSend("Automatic game start has been canceled.", room)
	}

	// If the user previously requested it, automatically start the game
	if t.AutomaticStart == len(t.Players) {
		// Check to see if the owner is present
		for _, p2 := range t.Players {
			if p2.ID == t.Owner {
				if !p2.Present {
					room := "table" + strconv.Itoa(t.ID)
					chatServerSend("Aborting automatic game start since the table creator is away.",
						room)
					return
				}

				commandTableStart(p2.Session, &CommandData{
					TableID: t.ID,
				})
				return
			}
		}

		logger.Error("Failed to find the owner of the game when attempting to " +
			"automatically start it.")
		return
	}

	// Play a notification sound if it has been more than 15 seconds since the last person joined
	if time.Since(t.DatetimeLastJoined) <= time.Second*15 {
		return
	}
	t.DatetimeLastJoined = time.Now()
	for _, p2 := range t.Players {
		// Skip sending a message to the player that just joined
		if p2.ID != p.ID {
			type SoundLobbyMessage struct {
				File string `json:"file"`
			}
			p2.Session.Emit("soundLobby", SoundLobbyMessage{
				File: "someone_joined",
			})
		}
	}
}
