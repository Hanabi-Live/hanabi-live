package tables

type disconnectUserData struct {
	userID int
}

// DisconnectUser requests that a user leaves all of their joined tables.
func (m *Manager) DisconnectUser(userID int) {
	m.newRequest(requestTypeDisconnectUser, &disconnectUserData{ // nolint: errcheck
		userID: userID,
	})
}

func (m *Manager) disconnectUser(data interface{}) interface{} {
	var d *disconnectUserData
	if v, ok := data.(*disconnectUserData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	// Go through every table that this user is playing in and unattend them
	playingAtTables := m.getUserPlaying(d.userID)
	for _, tableID := range playingAtTables {
		if tableManager, ok := m.tables[tableID]; ok {
			tableManager.Unattend(d.userID)
		} else {
			m.logger.Errorf(
				"User %v was marked as playing in table %v, but that table does not exist in the tables map.",
				d.userID,
				tableID,
			)
		}

		m.deleteUserPlaying(d.userID, tableID)
	}

	// Go through every table that this user is spectating and unspectate them
	tablesSpectatingList := m.getUserSpectating(d.userID)
	for _, tableID := range tablesSpectatingList {
		if tableManager, ok := m.tables[tableID]; ok {
			tableManager.Unspectate(d.userID)
		} else {
			m.logger.Errorf(
				"User %v was marked as spectating table %v, but that table does not exist in the tables map.",
				d.userID,
				tableID,
			)
		}

		m.deleteUserSpectating(d.userID, tableID)
	}

	return true
}
