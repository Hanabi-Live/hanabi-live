package table

import (
	"strconv"
)

type joinData struct {
	userID int
}

// Join will request that the given user joins the table (which must be in a pre-game state).
func (m *Manager) Join(userID int) {
	m.requests <- &request{
		Type: requestTypeJoin,
		Data: &joinData{
			userID: userID,
		},
	}
}

func (m *Manager) join(data interface{}) {
	var d *joinData
	if v, ok := data.(*joinData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	m.logger.Debug(strconv.Itoa(d.userID))
}
