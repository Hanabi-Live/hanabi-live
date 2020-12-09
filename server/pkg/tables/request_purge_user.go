package tables

type purgeUserData struct {
	userID     int
	errChannel chan error
}

// PurgeUser is a helper function for making a user leave all tables
// It will block until an error is received (e.g. the request is complete)
func (m *Manager) PurgeUser(userID int) error {
	errChannel := make(chan error)

	m.requests <- &request{
		Type: requestTypePurgeUser,
		Data: &purgeUserData{
			userID:     userID,
			errChannel: errChannel,
		},
	}

	return <-errChannel
}

func purgeUser(m *Manager, rawData interface{}) {
	var data *purgeUserData
	if v, ok := rawData.(*purgeUserData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", data)
		return
	} else {
		data = v
	}

	tablesList := m.getUserPlaying(data.userID)
	for _, tableID := range tablesList {
		if tableManager, ok := m.tables[tableID]; ok {
			if err := tableManager.Unattend(data.userID); err != nil {
				m.logger.Errorf(
					"Failed to unattend user ID %v from table %v: %v",
					data.userID,
					tableID,
					err,
				)
			}
		} else {
			m.logger.Errorf(
				"User %v was marked as playing in table %v, but that table does not exist in the tables map.",
				data.userID,
				tableID,
			)
		}

		m.deleteUserPlaying(data.userID, tableID)
	}
}
