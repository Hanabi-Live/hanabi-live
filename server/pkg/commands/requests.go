package commands

import (
	"fmt"
)

type request struct {
	reqType     requestType
	sessionData *SessionData
	commandName string
	commandData []byte
}

type requestType int

const (
	requestTypeNormal requestType = iota
	requestTypeTerminate
)

func (m *Manager) requestFuncMapInit() {
	m.requestFuncMap["tableCreate"] = m.tableCreate
	m.requestFuncMap["tableJoin"] = m.tableJoin
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

		if requestFunc, ok := m.requestFuncMap[req.commandName]; ok {
			requestFunc(req.sessionData, req.commandData)
		} else {
			m.logger.Warnf(
				"The %v manager received an invalid command of: %v",
				m.name,
				req.commandName,
			)
			msg := fmt.Sprintf("The command of \"%s\" is invalid.", req.commandName)
			m.Dispatcher.Sessions.NotifyError(req.sessionData.UserID, msg)
		}
	}
}

func (m *Manager) Send(sessionData *SessionData, commandName string, commandData []byte) {
	if m.requestsClosed.IsSet() {
		return
	}

	m.requests <- &request{
		reqType:     requestTypeNormal,
		sessionData: sessionData,
		commandName: commandName,
		commandData: commandData,
	}
}
