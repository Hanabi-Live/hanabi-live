/*
	Sent when the user clicks on the "Join" button in the lobby
	"data" example:
	{
		tableID: 15103,
	}
*/

package main

import (
	"strconv"
        "fmt"

	"github.com/Zamiell/hanabi-live/src/models"
)

func commandTableJoin(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the table exists
	tableID := d.TableID
        fmt.Printf("%d\n", tableID)
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that the player is not already joined to this table
	i := t.GameSpec.GetPlayerIndex(s.UserID())
	if i != -1 {
		s.Warning("You have already joined this table.")
		return
	}

	// Validate that the player is not joined to another table
	if g2 := s.GetJoinedTable(); g2 != nil {
		s.Warning("You cannot join more than one table at a time. " +
			"Terminate your old table before joining a new one.")
		return
	}

	// Validate that this table does not already have 6 players
	if len(t.GameSpec.Players) >= 6 {
		s.Warning("That table already has 6 players.")
		return
	}

	// Validate that the table is not started yet
	if t.Game.Running {
		s.Warning("That table has already started, so you cannot join it.")
		return
	}

	// Validate that they entered the correct password
	if t.Password != "" && d.Password != t.Password {
		s.Warning("That is not the correct password for this table.")
		return
	}

	/*
		Join
	*/

	log.Info(
		t.GetName() +
			"User \"" + s.Username() + "\" joined. " +
			"(There are now " + strconv.Itoa(len(t.GameSpec.Players)+1) + " players.)",
	)

	// Get the stats for this player
	var stats models.Stats
	if v, err := db.UserStats.Get(s.UserID(), variants[t.GameSpec.Options.Variant].ID); err != nil {
		log.Error("Failed to get the stats for player \""+s.Username()+"\":", err)
		s.Error("Something went wrong when getting your stats. Please contact an administrator.")
		return
	} else {
		stats = v
	}

	p := &Player{
		ID:   s.UserID(),
		Name: s.Username(),
		// We set the index in the "commandGameStart()" function
		Session: s,
		Present: true,
		Stats:   stats,
		// Time will get initialized below
		// Notes will get initialized after the deck is created in "commandGameStart.go"
		CharacterMetadata:  -1,
		CharacterMetadata2: -1,
	}
	p.InitTime(t)
	t.GameSpec.Players = append(t.GameSpec.Players, p)
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
	s.Emit("tableJoin", &JoinedMessage{
		TableID: tableID,
	})

	// Send them the chat history for this table
	chatSendPastFromTable(s, t)

	// Send the table owner whether or not the "Start Table" button should be grayed out
	t.NotifyTableReady()

	// If the user previously requested it, automatically start the table
	if t.AutomaticStart == len(t.GameSpec.Players) {
		// Check to see if the owner is present
		for _, p := range t.GameSpec.Players {
			if p.ID == t.Owner {
				if !p.Present {
					chatServerPregameSend("Aborting automatic table start since "+
						"the table creator is away.", t.ID)
					return
				}

				commandGameStart(p.Session, nil)
				return
			}
		}

		log.Error("Failed to find the owner of the table when attempting to automatically start it.")
	}
}
