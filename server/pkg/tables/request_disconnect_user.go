package tables

type disconnectUserData struct {
	userID   int
	username string
}

// DisconnectUser requests that a user leaves all of their joined tables.
func (m *Manager) DisconnectUser(userID int, username string) {
	m.newRequest(requestTypeDisconnectUser, &disconnectUserData{ // nolint: errcheck
		userID:   userID,
		username: username,
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
		/*
			m.unattend(&unattendData{
				userID: d.userID,
			})
		*/
		// TODO
		m.deleteUserPlaying(d.userID, tableID)
	}

	// Go through every table that this user is spectating and unspectate them
	tablesSpectatingList := m.getUserSpectating(d.userID)
	for _, tableID := range tablesSpectatingList {
		m.unspectate(&unspectateData{
			userID:   d.userID,
			username: d.username,
			tableID:  tableID,
		})
	}

	return true
}
