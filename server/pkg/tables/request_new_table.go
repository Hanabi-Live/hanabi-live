package tables

type newTableData struct {
	name string

	errChannel chan error
}

// NewTable is a helper function for requesting a new table
// It will block until an error is received (e.g. the request is complete)
func (m *Manager) NewTable(data *newTableData) error {
	errChannel := make(chan error)

	data.errChannel = errChannel
	m.requests <- &request{
		Type: requestTypeNewTable,
		Data: data,
	}

	return <-errChannel
}

func newTable(m *Manager, rawData interface{}) {
	var data *newTableData
	if v, ok := rawData.(*newTableData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", data)
		return
	} else {
		data = v
	}

	// TODO
	m.logger.Debug(data.name)
}
