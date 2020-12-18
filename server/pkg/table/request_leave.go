package table

import (
	"strconv"
)

type leaveData struct {
	userID int
}

// Leave will request the given user to leave the table (which must be in a pre-game state).
func (m *Manager) Leave(userID int) {
	m.requests <- &request{
		Type: requestTypeLeave,
		Data: &leaveData{
			userID: userID,
		},
	}
}

func (m *Manager) leave(data interface{}) {
	var d *leaveData
	if v, ok := data.(*leaveData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.logger.Debug(strconv.Itoa(d.userID))
}
