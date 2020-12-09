package sessions

import (
	"nhooyr.io/websocket"
)

type deleteSessionData struct {
	userID   int
	username string
}

func (m *Manager) DeleteSession(s *session) {
	m.requests <- &request{
		Type: requestTypeDeleteSession,
		Data: &deleteSessionData{
			userID:   s.userID,
			username: s.username,
		},
	}
}

func deleteSession(m *Manager, rawData interface{}) {
	var data *deleteSessionData
	if v, ok := rawData.(*deleteSessionData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", data)
		return
	} else {
		data = v
	}

	var s *session
	if v, ok := m.sessions[data.userID]; !ok {
		// The session for this user does not exist in the sessions map,
		// so we don't have to do anything
		return
	} else {
		s = v
	}

	// Close the existing connection
	// This will be a no-op if it is already closed
	// We do this in a new goroutine to avoid blocking
	go s.conn.Close(websocket.StatusNormalClosure, "")

	// Delete the entry from the sessions map
	delete(m.sessions, data.userID)

	logSession(m, data.userID, data.username, false)
}
