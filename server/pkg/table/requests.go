package table

type request struct {
	Type int // See the requestType constants below
	Data interface{}
}

const (
	requestTypeJoin = iota
	requestTypeLeave
	requestTypeUnattend
	requestTypeSpectate
	requestTypeUnspectate
	requestTypeGetDescription
)

func (m *Manager) requestFuncMapInit() {
	m.requestFuncMap[requestTypeJoin] = m.join
	m.requestFuncMap[requestTypeLeave] = m.leave
	m.requestFuncMap[requestTypeUnattend] = m.unattend
	m.requestFuncMap[requestTypeSpectate] = m.spectate
	m.requestFuncMap[requestTypeUnspectate] = m.unspectate
	m.requestFuncMap[requestTypeGetDescription] = m.getDescription
}

// ListenForRequests will block until messages are sent on the request channel.
// It is meant to be run in a new goroutine.
func (m *Manager) ListenForRequests() {
	for {
		req := <-m.requests

		if requestFunc, ok := m.requestFuncMap[req.Type]; ok {
			requestFunc(req.Data)
		} else {
			m.logger.Errorf("The session manager received an invalid request type of: %v", req.Type)
		}
	}
}
