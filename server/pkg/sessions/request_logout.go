package sessions

import "github.com/Zamiell/hanabi-live/server/pkg/util"

type logoutData struct {
	userID   int
	username string
}

func (m *Manager) Logout(userID int, username string) {
	m.newRequest(requestTypeLogout, &logoutData{ // nolint: errcheck
		userID:   userID,
		username: username,
	})
}

func (m *Manager) logout(data interface{}) {
	var d *logoutData
	if v, ok := data.(*logoutData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	var s *session
	if v, ok := m.sessions[d.userID]; !ok {
		m.logger.Infof(
			"Attempted to manually log out %v, but they were not online.",
			util.PrintUser(d.userID, d.username),
		)
		return
	} else {
		s = v
	}

	m.delete(&deleteData{
		userID:   s.userID,
		username: s.username,
	})

	m.logger.Infof(
		"Successfully terminated the WebSocket connection for %v.",
		util.PrintUser(d.userID, d.username),
	)
}
