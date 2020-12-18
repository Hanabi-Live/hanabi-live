package tables

type request struct {
	Type int // See the requestType constants below
	Data interface{}
}

const (
	requestTypeNew = iota
	requestTypeDelete
	requestTypeDisconnectUser
	requestTypeGetTables
	requestTypeGetUserTables
	requestTypePrint
)

func (m *Manager) requestFuncMapInit() {
	m.requestFuncMap[requestTypeNew] = m.new
	m.requestFuncMap[requestTypeDelete] = func(interface{}) {}
	m.requestFuncMap[requestTypeDisconnectUser] = m.disconnectUser
	m.requestFuncMap[requestTypeGetTables] = m.getTables
	m.requestFuncMap[requestTypeGetUserTables] = m.getUserTables
	m.requestFuncMap[requestTypePrint] = m.print
}

// ListenForRequests will block until messages are sent on the request channel.
// It is meant to be run in a new goroutine.
func (m *Manager) ListenForRequests() {
	for {
		req := <-m.requests

		if requestFunc, ok := m.requestFuncMap[req.Type]; ok {
			requestFunc(req.Data)
		} else {
			m.logger.Errorf("The tables manager received an invalid request type of: %v", req.Type)
		}
	}
}
