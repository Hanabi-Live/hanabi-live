/*
	Sent when the user clicks on the "Join" button in the lobby
	"data" example:
	{
		gameID: 15103,
	}
*/

package main

import (
	"strconv"
	"time"
)

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

	// Validate that they entered the correct password
	if t.Password != "" && d.Password != t.Password {
		s.Warning("That is not the correct password for this game.")
		return
	}

	/*
		Join
	*/

	logger.Info(t.GetName() + "User \"" + s.Username() + "\" joined. " +
		"(There are now " + strconv.Itoa(len(t.Players)+1) + " players.)")

	// Get the total number of non-speedrun games that this player has played
	var numGames int
	if v, err := models.Games.GetUserNumGames(s.UserID(), false); err != nil {
		logger.Error("Failed to get the number of non-speedrun games for player \""+s.Username()+"\":", err)
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
	s.Set("currentTable", tableID)
	s.Set("status", statusPregame)
	notifyAllUser(s)

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

	// Send the table owner whether or not the "Start Game" button should be grayed out
	t.NotifyTableReady()

	// If there is an automatic start countdown, cancel it
	if !t.DatetimePlannedStart.IsZero() {
		t.DatetimePlannedStart = time.Time{} // Assign a zero value
		room := "table" + strconv.Itoa(t.ID)
		chatServerSend("Automatic game start has been canceled.", room)
	}

	// If the user previously requested it, automatically start the game
	if t.AutomaticStart == len(t.Players) {
		// Check to see if the owner is present
		for _, p := range t.Players {
			if p.ID == t.Owner {
				if !p.Present {
					room := "table" + strconv.Itoa(t.ID)
					chatServerSend("Aborting automatic game start since the table creator is away.",
						room)
					return
				}

				commandTableStart(p.Session, nil)
				return
			}
		}

		logger.Error("Failed to find the owner of the game when attempting to automatically start it.")
	}
}
