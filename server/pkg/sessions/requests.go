package sessions

import "errors"

type request struct {
	reqType int // See the requestType constants below
	data    interface{}
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

		if req.reqType == requestTypeTerminate {
			break
		}

		if requestFunc, ok := m.requestFuncMap[req.reqType]; ok {
			requestFunc(req.data)
		} else {
			m.logger.Errorf(
				"The sessions manager received an invalid request type of: %v",
				req.reqType,
			)
		}
	}
}

func (m *Manager) newRequest(reqType int, data interface{}) error {
	if m.requestsClosed.IsSet() {
		return errors.New("sessions manager is closed to new requests")
	}

	m.requests <- &request{
		reqType: reqType,
		data:    data,
	}

	return nil
}
