package sessions

import (
	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type setStatusData struct {
	userID  int
	status  constants.Status
	tableID int
}

// SetStatus updates both the status and the table ID values within a user's session object.
// Then, it notifies all other online users about this user's new status.
func (m *Manager) SetStatus(userID int, status constants.Status, tableID int) {
	m.newRequest(requestTypeSetStatus, &setStatusData{ // nolint: errcheck
		userID:  userID,
		status:  status,
		tableID: tableID,
	})
}

func (m *Manager) setStatus(data interface{}) {
	var d *setStatusData
	if v, ok := data.(*setStatusData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	var s *session
	if v, ok := m.sessions[d.userID]; !ok {
		// Other server components might be trying to send a message to a user who has already
		// disconnected, so just ignore this request
		return
	} else {
		s = v
	}

	s.status = d.status
	s.tableID = d.tableID

	m.notifyAllUser(s)
}
