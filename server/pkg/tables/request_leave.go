package tables

type leaveData struct {
	userID   int
	username string
	tableID  int
}

func (m *Manager) Leave(userID int, username string, tableID int) {
	m.newRequest(requestTypeLeave, &leaveData{ // nolint: errcheck
		userID:   userID,
		username: username,
		tableID:  tableID,
	})
}

func (m *Manager) leave(data interface{}) interface{} {
	var d *leaveData
	if v, ok := data.(*leaveData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	m.logger.Infof("%v", d.userID)

	return true
}
