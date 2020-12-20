package table

import (
	"fmt"
)

type request struct {
	reqType int // See the requestType constants below
	data    interface{}
}

const (
	requestTypeJoin = iota
	requestTypeLeave
	requestTypeUnattend
	requestTypeSpectate
	requestTypeUnspectate
	requestTypeGetDescription
	requestTypeTerminate
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
				"The session manager received an invalid request type of: %v",
				req.reqType,
			)
		}
	}
}

func (m *Manager) newRequest(reqType int, data interface{}) error {
	if m.requestsClosed.IsSet() {
		return fmt.Errorf("table %v manager is closed to new requests", m.table.ID)
	}

	m.requests <- &request{
		reqType: reqType,
		data:    data,
	}

	return nil
}
