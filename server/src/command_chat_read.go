package main

// commandChatRead is sent when the user opens the in-game chat or
// when they receive a chat message when the in-game chat is already open
//
// Example data:
// {
//   tableID: 5,
// }
func commandChatRead(s *Session, d *CommandData) {
	t, exists := getTableAndLock(s, d.TableID, !d.NoLock)
	if !exists {
		return
	}
	if !d.NoLock {
		defer t.Mutex.Unlock()
	}

	// Validate that they are in the game or are a spectator
	playerIndex := t.GetPlayerIndexFromID(s.UserID)
	spectatorIndex := t.GetSpectatorIndexFromID(s.UserID)
	if playerIndex == -1 && spectatorIndex == -1 {
		// Return without an error message if they are not playing or spectating at the table
		// (to account for lag)
		return
	}
	if spectatorIndex == -1 && t.Replay {
		// Return without an error message if they are not spectating at the replay
		// (to account for lag)
		return
	}

	// Mark that they have read all of the in-game chat
	t.ChatRead[s.UserID] = len(t.Chat)
}
