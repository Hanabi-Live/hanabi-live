package main

import (
	"strconv"
)

// commandTableSetLeader is sent when a user right-clicks on the crown
// or types the "/setleader [username]" command
//
// Example data:
// {
//   tableID: 123,
//   name: 'Alice,
// }
func commandTableSetLeader(s *Session, d *CommandData) {
	// Validate that the table exists
	tableID := d.TableID
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	if s.UserID() != t.Owner {
		s.Warning(ChatCommandNotOwnerFail)
		return
	}

	if len(d.Name) == 0 {
		s.Warning("You must specify the username to pass the lead to. (e.g. \"/setleader Alice\")")
		return
	}

	if t.Replay && !t.Visible {
		s.Warning("You cannot set a new leader in a solo replay.")
		return
	}

	normalizedUsername := normalizeString(d.Name)

	// Validate that they did not target themselves
	if normalizedUsername == normalizeString(s.Username()) {
		s.Warning("You cannot pass leadership to yourself.")
		return
	}

	// Validate that they are at the table
	newLeaderID := -1
	var newLeaderUsername string
	var newLeaderIndex int
	if t.Replay {
		for _, sp := range t.Spectators {
			if normalizeString(sp.Name) == normalizedUsername {
				newLeaderID = sp.ID
				newLeaderUsername = sp.Name
				break
			}
		}
	} else {
		for i, p := range t.Players {
			if normalizeString(p.Name) == normalizedUsername {
				newLeaderID = p.ID
				newLeaderUsername = p.Name
				newLeaderIndex = i
				break
			}
		}
	}
	if newLeaderID == -1 {
		var msg string
		if t.Replay {
			msg = "\"" + d.Name + "\" is not spectating the shared replay."
		} else {
			msg = "\"" + d.Name + "\" is not joined to this table."
		}
		s.Error(msg)
		return
	}

	t.Owner = newLeaderID

	if t.Replay {
		t.NotifyReplayLeader()
	} else {
		if !t.Running {
			// On the pregame screen, the leader should always be the leftmost player,
			// so we need to swap elements in the players slice
			i := t.GetPlayerIndexFromID(s.UserID())
			t.Players[i], t.Players[newLeaderIndex] = t.Players[newLeaderIndex], t.Players[i]

			// Re-send the "game" message that draws the pregame screen and enables/disables the
			// "Start Game" button
			t.NotifyPlayerChange()
		}

		room := "table" + strconv.Itoa(t.ID)
		chatServerSend(s.Username()+" has passed table ownership to: "+newLeaderUsername, room)
	}
}
