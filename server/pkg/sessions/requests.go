package sessions

type request struct {
	Type int // See the requestType constants below
	Data interface{}
}

const (
	requestTypeNew = iota
	requestTypeDelete

	requestTypeNotifyAllUser
	requestTypeNotifyAllUserLeft
	requestTypeNotifyWarning
	requestTypeNotifyError
	requestTypeNotifyAllError

	requestTypePrint
	requestTypeTerminate
)

func (m *Manager) requestFuncMapInit() {
	m.requestFuncMap[requestTypeNew] = m.new
	m.requestFuncMap[requestTypeDelete] = m.delete

	m.requestFuncMap[requestTypeNotifyAllUser] = m.notifyAllUser
	m.requestFuncMap[requestTypeNotifyAllUserLeft] = m.notifyAllUserLeft
	m.requestFuncMap[requestTypeNotifyWarning] = m.notifyWarning
	m.requestFuncMap[requestTypeNotifyError] = m.notifyError
	m.requestFuncMap[requestTypeNotifyAllError] = m.notifyAllError

	m.requestFuncMap[requestTypePrint] = m.print
}

// ListenForRequests will block until messages are sent on the request channel.
// It is meant to be run in a new goroutine.
func (m *Manager) ListenForRequests() {
	m.requestsWaitGroup.Add(1)
	defer m.requestsWaitGroup.Done()

	for {
		req := <-m.requests

		if req.Type == requestTypeTerminate {
			break
		}

		if requestFunc, ok := m.requestFuncMap[req.Type]; ok {
			requestFunc(req.Data)
		} else {
			m.logger.Errorf(
				"The sessions manager received an invalid request type of: %v",
				req.Type,
			)
		}
	}
}
