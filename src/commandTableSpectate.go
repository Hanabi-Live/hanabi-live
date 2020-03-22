/*
	Sent when the user clicks on the "Spectate" button in the lobby
	(the client will send a "hello" message after getting "tableStart")
	Sent on behalf of a user when they create a solo replay
	Sent on behalf of a user when they create a shared replay
	Sent on behalf of a user when they reconnect after having been in a shared replay

	"data" example:
	{
		gameID: 15103,
		player: "Zamiel", // Optional
		// If the player is specified, they will spectate from that player's perspective
	}
*/

package main

import (
	"strconv"
)

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
		if t.Replay {
			s.Warning("You cannot provide a player index to a replay.")
			return
		}

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
	s.Set("currentTable", t.ID)
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
	s.NotifyTableStart()
}
