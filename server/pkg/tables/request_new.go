package tables

type newData struct {
	name string

	errChannel chan error
}

// New requests that a new table is created.
// It will block until an error is received (e.g. the request is complete).
func (m *Manager) New(data *newData) error {
	errChannel := make(chan error)

	data.errChannel = errChannel
	m.requests <- &request{
		Type: requestTypeNew,
		Data: data,
	}

	return <-errChannel
}

func (m *Manager) new(data interface{}) {
	var d *newData
	if v, ok := data.(*newData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	// TODO
	m.logger.Debug(d.name)
}
