package table

type unattendData struct {
	userID     int
	errChannel chan error
}

// Unattend is a helper function for marking a user playing in an ongoing game as being disconnected
// It will block until an error is received (e.g. the request is complete)
func (m *Manager) Unattend(userID int) error {
	errChannel := make(chan error)

	m.requests <- &request{
		Type: requestTypeUnattend,
		Data: &unattendData{
			userID:     userID,
			errChannel: errChannel,
		},
	}

	return <-errChannel
}

func unattend(m *Manager, rawData interface{}) {
	/*
		var data *unattendData
		if v, ok := rawData.(*unattendData); !ok {
			m.logger.Errorf("Failed type assertion for data of type: %T", data)
			return
		} else {
			data = v
		}
	*/
}
