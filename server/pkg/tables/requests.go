package tables

type request struct {
	Type int // See the requestType constants below
	Data interface{}
}

const (
	requestTypeNewTable = iota
	requestTypeDeleteTable
	requestTypePurgeUser
	requestTypePrint
)

func (m *Manager) requestFuncMapInit() {
	m.requestFuncMap[requestTypeNewTable] = newTable
	m.requestFuncMap[requestTypeDeleteTable] = func(*Manager, interface{}) {}
	m.requestFuncMap[requestTypePurgeUser] = purgeUser
	m.requestFuncMap[requestTypePurgeUser] = print
}

// ListenForRequests will block until messages are sent on the request channel
// It is meant to be run in a new goroutine
func (m *Manager) ListenForRequests() {
	for {
		req := <-m.requests

		if requestFunc, ok := m.requestFuncMap[req.Type]; ok {
			requestFunc(m, req.Data)
		} else {
			m.logger.Errorf("The tables manager received an invalid request type of: %v", req.Type)
		}
	}
}
