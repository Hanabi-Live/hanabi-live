package sessions

// getRelevantUserIDs gets a list of online user sessions that should be notified about certain
// events from this table.
// We start with a list of user IDs playing + spectating the table.
// First, we add those from the list that are online.
// Second, we add user IDs that have these users on their friends list (that are online).
func (m *Manager) getRelevantUserIDs(tableUserIDs []int, excludeTablePlayers bool) []int {
	userIDMap := make(map[int]struct{})

	for _, userID := range tableUserIDs {
		if s, ok := m.sessions[userID]; ok {
			userIDMap[userID] = struct{}{}

			for friendID := range s.data.reverseFriends {
				if _, ok := m.sessions[friendID]; ok {
					userIDMap[userID] = struct{}{}
				}
			}
		}
	}

	// In some situations, we need to only notify the reverse friends;
	// including the players would mean that the players get duplicate messages
	if excludeTablePlayers {
		for _, userID := range tableUserIDs {
			delete(userIDMap, userID)
		}
	}

	// Convert the map to a slice
	userIDs := make([]int, 0)
	for userID := range userIDMap {
		userIDs = append(userIDs, userID)
	}

	return userIDs
}
