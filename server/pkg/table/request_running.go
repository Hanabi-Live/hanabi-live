package table

type runningData struct {
	resultsChannel chan bool
}

// Running returns whether or not the table is running.
func (m *Manager) Running() bool {
	resultsChannel := make(chan bool)

	if err := m.newRequest(requestTypeRunning, &runningData{
		resultsChannel: resultsChannel,
	}); err != nil {
		return false
	}

	return <-resultsChannel
}

func (m *Manager) running(data interface{}) {
	var d *runningData
	if v, ok := data.(*runningData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// Local variables
	t := m.table

	d.resultsChannel <- t.Running
}
