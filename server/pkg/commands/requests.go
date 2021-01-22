package commands

import (
	"fmt"

	"github.com/Zamiell/hanabi-live/server/pkg/types"
)

type request struct {
	reqType     requestType
	sessionData *types.SessionData
	commandName string
	commandData []byte
}

type requestType int

const (
	requestTypeNormal requestType = iota
	requestTypeShutdown
)

func (m *Manager) commandFuncMapInit() {
	m.commandFuncMap["chat"] = m.chat
	m.commandFuncMap["chatPM"] = m.chatPM
	m.commandFuncMap["friend"] = m.friend
	m.commandFuncMap["tableCreate"] = m.tableCreate
	m.commandFuncMap["tableJoin"] = m.tableJoin
	m.commandFuncMap["tableUnattend"] = m.tableUnattend
	m.commandFuncMap["tableUnspectate"] = m.tableUnspectate
}

// ListenForRequests will block until messages are sent on the request channel.
// It is meant to be run in a new goroutine.
func (m *Manager) ListenForRequests() {
	m.requestsWaitGroup.Add(1)
	defer m.requestsWaitGroup.Done()

	for {
		req := <-m.requests

		if req.reqType == requestTypeShutdown {
			break
		}

		if commandFunc, ok := m.commandFuncMap[req.commandName]; ok {
			commandFunc(req.commandName, req.commandData, req.sessionData)
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

func (m *Manager) Send(sessionData *types.SessionData, commandName string, commandData []byte) {
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
