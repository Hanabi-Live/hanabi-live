package main

import (
	"context"
)

type NewLeader struct {
	UserID   int
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
func commandTableSetLeader(ctx context.Context, s *Session, d *CommandData) {
	t, exists := getTableAndLock(ctx, s, d.TableID, !d.NoTableLock, !d.NoTablesLock)
	if !exists {
		return
	}
	if !d.NoTableLock {
		defer t.Unlock(ctx)
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
	var newLeader *NewLeader
	if t.Replay {
		for _, sp := range t.Spectators {
			if normalizeString(sp.Name) == normalizedUsername {
				newLeader = &NewLeader{
					UserID:   sp.UserID,
					Username: sp.Name,
					Index:    -1,
				}
				break
			}
		}
	} else {
		for i, p := range t.Players {
			if normalizeString(p.Name) == normalizedUsername {
				newLeader = &NewLeader{
					UserID:   p.UserID,
					Username: p.Name,
					Index:    i,
				}
				break
			}
		}
	}
	if newLeader == nil {
		var msg string
		if t.Replay {
			msg = "\"" + d.Name + "\" is not spectating the shared replay."
		} else {
			msg = "\"" + d.Name + "\" is not joined to this table."
		}
		s.Error(msg)
		return
	}

	tableSetLeader(ctx, s, d, t, newLeader)
}

func tableSetLeader(
	ctx context.Context,
	s *Session,
	d *CommandData,
	t *Table,
	newLeader *NewLeader,
) {
	t.OwnerID = newLeader.UserID

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
		chatServerSend(ctx, msg, t.GetRoomName(), d.NoTablesLock)
	}
}
