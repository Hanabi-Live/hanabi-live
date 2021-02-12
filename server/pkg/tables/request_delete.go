package tables

import (
	"github.com/Zamiell/hanabi-live/server/pkg/table"
)

/*
type disconnectUserData struct {
	userID   int
	username string
}

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
}
*/

func (m *Manager) delete(tableIDToDelete int, t *table.Manager) {
	// Stop the table goroutine that is listening for requests
	t.Shutdown()

	// Remove the table manager from the map
	delete(m.tables, tableIDToDelete)

	m.ensureNoStrayPlayingRelationship(tableIDToDelete)
	m.ensureNoStraySpectatingRelationship(tableIDToDelete)
}

func (m *Manager) ensureNoStrayPlayingRelationship(tableIDToDelete int) {
	for userID, tableIDs := range m.usersPlaying {
		for _, tableID := range tableIDs {
			if tableID == tableIDToDelete {
				m.logger.Errorf(
					"Found a stray playing relationship when deleting table %v for user %v.",
					tableIDToDelete,
					userID,
				)
				m.deleteUserPlaying(userID, tableIDToDelete)
			}
		}
	}
}

func (m *Manager) ensureNoStraySpectatingRelationship(tableIDToDelete int) {
	for userID, tableIDs := range m.usersSpectating {
		for _, tableID := range tableIDs {
			if tableID == tableIDToDelete {
				m.logger.Errorf(
					"Found a stray spectating relationship when deleting table %v for user %v.",
					tableIDToDelete,
					userID,
				)
				m.deleteUserSpectating(userID, tableIDToDelete)
			}
		}
	}
}
