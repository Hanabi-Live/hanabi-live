package commands

import (
	"fmt"
)

type request struct {
	reqType int // See the requestType constants below
	userID  int
	command string
	data    interface{}
}

const (
	requestTypeNormal = iota
	requestTypeTerminate
)

func (m *Manager) requestFuncMapInit() {
	m.requestFuncMap["tableCreate"] = m.tableCreate
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

		if requestFunc, ok := m.requestFuncMap[req.command]; ok {
			requestFunc(req.userID, req.data)
		} else {
			m.logger.Warnf(
				"The commands manager received an invalid command type of: %v",
				req.command,
			)
			msg := fmt.Sprintf("The command of \"%s\" is invalid.", req.command)
			m.Dispatcher.Sessions.NotifyError(req.userID, msg)
		}
	}
}
