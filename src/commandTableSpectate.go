package main

import (
	"strconv"
)

// commandTableSpectate is sent when:
// 1) the user clicks on the "Spectate" button in the lobby
// 2) the user creates a solo replay
// 3) the user creates a shared replay
// 4) on behalf of a user when they reconnect after having been in a shared replay
//
// Example data:
// {
//   tableID: 15103,
//   // If the player is specified, they will spectate from that player's perspective
//   player: 'Alice', // Optional
// }
func commandTableSpectate(s *Session, d *CommandData) {
	/*
		Validation
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
	g := t.Game

	// Validate that the game has started
	if !t.Running {
		s.Warning("The game for table " + strconv.Itoa(tableID) + " has not started yet.")
		return
	}

	// Validate that they are not already spectating a game
	for _, t2 := range tables {
		for _, sp := range t2.Spectators {
			if sp.ID == s.UserID() {
				if t2.ID == t.ID {
					s.Warning("You are already spectating this table.")
				} else {
					s.Warning("You are already spectating another table.")
				}
				return
			}
		}
	}

	// Validate the player name
	// (if provided, they want to spectate from a specific player's perspective)
	playerIndex := -1
	if d.Player != "" {
		for i, p := range t.Players {
			if p.Name == d.Player {
				playerIndex = i
				break
			}
		}
		if playerIndex == -1 {
			s.Warning("That is an invalid player name.")
			return
		}
	}

	/*
		Spectate / Join Solo Replay / Join Shared Replay
	*/

	if t.Replay {
		logger.Info(t.GetName() + "User \"" + s.Username() + "\" joined the replay.")
	} else {
		logger.Info(t.GetName() + "User \"" + s.Username() + "\" spectated.")
	}

	// Add them to the spectators object
	sp := &Spectator{
		ID:          s.UserID(),
		Name:        s.Username(),
		Session:     s,
		Shadowing:   playerIndex != -1,
		PlayerIndex: playerIndex,
		// There are notes for every card in the deck + the stack bases for each suit
		Notes: make([]string, len(g.Deck)+len(variants[t.Options.Variant].Suits)),
	}
	t.Spectators = append(t.Spectators, sp)
	notifyAllTable(t)    // Update the spectator list for the row in the lobby
	t.NotifySpectators() // Update the in-game spectator list

	// Set their status
	status := statusSpectating
	if t.Replay {
		if t.Visible {
			status = statusSharedReplay
		} else {
			status = statusReplay
		}
	}
	s.Set("status", status)
	notifyAllUser(s)

	// Send them a "tableStart" message
	// After the client receives the "tableStart" message, they will load the UI and then send a
	// "hello" message to get the rest of the data for the game
	s.NotifyTableStart()
}
