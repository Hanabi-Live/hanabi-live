package tables

func (m *Manager) addUserPlaying(userID int, tableID int) {
	addUserTable(userID, tableID, m.usersPlaying)
}

func (m *Manager) deleteUserPlaying(userID int, tableID int) {
	deleteUserTable(userID, tableID, m.usersPlaying)
}

func (m *Manager) getUserPlaying(userID int) []int {
	return getUserTables(userID, m.usersPlaying)
}
