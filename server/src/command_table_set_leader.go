package main

type NewLeader struct {
	ID       int
	Username string
	Index    int
}

// commandTableSetLeader is sent when a user right-clicks on the crown
// or types the "/setleader [username]" command
//
// Example data:
// {
//   tableID: 123,
//   name: 'Alice,
// }
func commandTableSetLeader(s *Session, d *CommandData) {
	t, exists := getTableAndLock(s, d.TableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
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
	if normalizedUsername == normalizeString(s.Username) {
		s.Warning("You cannot pass leadership to yourself.")
		return
	}

	// Validate that they are at the table
	newLeader := &NewLeader{
		ID: -1,
	}
	if t.Replay {
		for _, sp := range t.Spectators {
			if normalizeString(sp.Name) == normalizedUsername {
				newLeader.ID = sp.ID
				newLeader.Username = sp.Name
				break
			}
		}
	} else {
		for i, p := range t.Players {
			if normalizeString(p.Name) == normalizedUsername {
				newLeader.ID = p.ID
				newLeader.Username = p.Name
				newLeader.Index = i
				break
			}
		}
	}
	if newLeader.ID == -1 {
		var msg string
		if t.Replay {
			msg = "\"" + d.Name + "\" is not spectating the shared replay."
		} else {
			msg = "\"" + d.Name + "\" is not joined to this table."
		}
		s.Error(msg)
		return
	}

	tableSetLeader(s, t, newLeader)
}

func tableSetLeader(s *Session, t *Table, newLeader *NewLeader) {
	t.Owner = newLeader.ID

	if t.Replay {
		t.NotifyReplayLeader()
	} else {
		if !t.Running {
			// On the pregame screen, the leader should always be the leftmost player,
			// so we need to swap elements in the players slice
			playerIndex := t.GetPlayerIndexFromID(s.UserID)
			t.Players[playerIndex], t.Players[newLeader.Index] = t.Players[newLeader.Index], t.Players[playerIndex]

			// Re-send the "game" message that draws the pregame screen
			// and enables/disables the "Start Game" button
			t.NotifyPlayerChange()
		}

		msg := s.Username + " has passed table ownership to: " + newLeader.Username
		chatServerSend(msg, t.GetRoomName())
	}
}
