package table

import (
	"fmt"
)

type request struct {
	reqType requestType
	data    interface{}
}

type requestType int

const (
	requestTypeAction requestType = iota
	requestTypeAutomaticStart
	requestTypeChatNormal
	requestTypeChatServer
	requestTypeExport
	requestTypeFindVariant
	requestTypeGetDescription
	requestTypeImpostor
	requestTypeJoin
	requestTypeKick
	requestTypeLeave
	requestTypeMissingScores
	requestTypePause
	requestTypeReplay
	requestTypeRunning
	requestTypeSpectate
	requestTypeStart
	requestTypeStartIn
	requestTypeStartInWaitComplete
	requestTypeSuggest
	requestTypeTags
	requestTypeTerminateNormal
	requestTypeTerminateServer
	requestTypeUnattend
	requestTypeUnspectate

	requestTypeShutdown
)

func (m *Manager) requestFuncMapInit() {
	m.requestFuncMap[requestTypeAction] = m.action
	m.requestFuncMap[requestTypeAutomaticStart] = m.automaticStart
	m.requestFuncMap[requestTypeChatNormal] = m.chatNormal
	m.requestFuncMap[requestTypeChatServer] = m.chatServer
	m.requestFuncMap[requestTypeExport] = m.export
	m.requestFuncMap[requestTypeFindVariant] = m.findVariant
	m.requestFuncMap[requestTypeGetDescription] = m.getDescription
	m.requestFuncMap[requestTypeImpostor] = m.impostor
	m.requestFuncMap[requestTypeJoin] = m.join
	m.requestFuncMap[requestTypeKick] = m.kick
	m.requestFuncMap[requestTypeLeave] = m.leave
	m.requestFuncMap[requestTypeMissingScores] = m.missingScores
	m.requestFuncMap[requestTypePause] = m.pause
	m.requestFuncMap[requestTypeReplay] = m.replay
	m.requestFuncMap[requestTypeRunning] = m.running
	m.requestFuncMap[requestTypeSpectate] = m.spectate
	m.requestFuncMap[requestTypeStart] = m.start
	m.requestFuncMap[requestTypeStartIn] = m.startIn
	m.requestFuncMap[requestTypeStartInWaitComplete] = m.startInWaitComplete
	m.requestFuncMap[requestTypeSuggest] = m.suggest
	m.requestFuncMap[requestTypeTags] = m.tags
	m.requestFuncMap[requestTypeTerminateNormal] = m.terminateNormal
	m.requestFuncMap[requestTypeTerminateServer] = m.terminateServer
	m.requestFuncMap[requestTypeUnattend] = m.unattend
	m.requestFuncMap[requestTypeUnspectate] = m.unspectate
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

		if requestFunc, ok := m.requestFuncMap[req.reqType]; ok {
			requestFunc(req.data)
		} else {
			m.logger.Errorf(
				"The %v manager received an invalid request type of: %v",
				m.name,
				req.reqType,
			)
		}
	}
}

func (m *Manager) newRequest(reqType requestType, data interface{}) error {
	if m.requestsClosed.IsSet() {
		return fmt.Errorf("%v manager is closed to new requests", m.name)
	}

	m.requests <- &request{
		reqType: reqType,
		data:    data,
	}

	return nil
}
