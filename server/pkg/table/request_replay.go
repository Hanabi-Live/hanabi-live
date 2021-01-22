package table

type replayData struct {
	resultsChannel chan bool
}

// Replay returns whether or not the table is a replay.
func (m *Manager) Replay() bool {
	resultsChannel := make(chan bool)

	if err := m.newRequest(requestTypeReplay, &replayData{
		resultsChannel: resultsChannel,
	}); err != nil {
		return false
	}

	return <-resultsChannel
}

func (m *Manager) replay(data interface{}) {
	var d *replayData
	if v, ok := data.(*replayData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table

	d.resultsChannel <- t.Running
}
