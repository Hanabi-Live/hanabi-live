package tables

func (m *Manager) addUserPlaying(userID int, tableID uint64) {
	addUserTable(userID, tableID, m.usersPlaying)
}

func (m *Manager) deleteUserPlaying(userID int, tableID uint64) {
	deleteUserTable(userID, tableID, m.usersPlaying)
}

func (m *Manager) getUserPlaying(userID int) []uint64 {
	return getUserTables(userID, m.usersPlaying)
}
