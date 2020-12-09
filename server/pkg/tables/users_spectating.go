package tables

func (m *Manager) addUserSpectating(userID int, tableID uint64) {
	addUserTable(userID, tableID, m.usersSpectating)
}

func (m *Manager) deleteUserSpectating(userID int, tableID uint64) {
	deleteUserTable(userID, tableID, m.usersSpectating)
}

func (m *Manager) getUserSpectating(userID int) []uint64 {
	return getUserTables(userID, m.usersSpectating)
}
