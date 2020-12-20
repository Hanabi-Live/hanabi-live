package tables

func (m *Manager) addUserSpectating(userID int, tableID int) {
	addUserTable(userID, tableID, m.usersSpectating)
}

func (m *Manager) deleteUserSpectating(userID int, tableID int) {
	deleteUserTable(userID, tableID, m.usersSpectating)
}

func (m *Manager) getUserSpectating(userID int) []int {
	return getUserTables(userID, m.usersSpectating)
}
