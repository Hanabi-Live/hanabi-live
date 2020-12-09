package table

type request struct {
	Type int // See the requestType constants below
	Data interface{}
}

const (
	requestTypeUnattend = iota
	requestTypeBar
)

func (m *Manager) requestFuncMapInit() {
	m.requestFuncMap[requestTypeUnattend] = unattend
	m.requestFuncMap[requestTypeBar] = func(*Manager, interface{}) {}
}

// ListenForRequests will block until messages are sent on the request channel
// It is meant to be run in a new goroutine
func (m *Manager) ListenForRequests() {
	for {
		req := <-m.requests

		if requestFunc, ok := m.requestFuncMap[req.Type]; ok {
			requestFunc(m, req.Data)
		} else {
			m.logger.Errorf("The session manager received an invalid request type of: %v", req.Type)
		}
	}
}
