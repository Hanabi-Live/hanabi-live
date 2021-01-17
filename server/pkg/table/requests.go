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
	requestTypeJoin requestType = iota
	requestTypeLeave
	requestTypeUnattend
	requestTypeSpectate
	requestTypeUnspectate

	requestTypeGetDescription
	requestTypeStart
	requestTypePause
	requestTypeTerminate

	requestTypeChat
	requestTypeAutomaticStart
	requestTypeStartIn
	requestTypeStartInWaitComplete
	requestTypeMissingScores
	requestTypeFindVariant
	requestTypeKick
	requestTypeSuggest
	requestTypeTags
	requestTypeImpostor

	requestTypeShutdown
)

func (m *Manager) requestFuncMapInit() {
	m.requestFuncMap[requestTypeJoin] = m.join
	m.requestFuncMap[requestTypeLeave] = m.leave
	m.requestFuncMap[requestTypeUnattend] = m.unattend
	m.requestFuncMap[requestTypeSpectate] = m.spectate
	m.requestFuncMap[requestTypeUnspectate] = m.unspectate

	m.requestFuncMap[requestTypeGetDescription] = m.getDescription
	m.requestFuncMap[requestTypeStart] = m.start
	m.requestFuncMap[requestTypePause] = m.pause
	m.requestFuncMap[requestTypeTerminate] = m.terminate

	m.requestFuncMap[requestTypeChat] = m.chat
	m.requestFuncMap[requestTypeAutomaticStart] = m.automaticStart
	m.requestFuncMap[requestTypeStartIn] = m.startIn
	m.requestFuncMap[requestTypeStartInWaitComplete] = m.startInWaitComplete
	m.requestFuncMap[requestTypeMissingScores] = m.missingScores
	m.requestFuncMap[requestTypeFindVariant] = m.findVariant
	m.requestFuncMap[requestTypeKick] = m.kick
	m.requestFuncMap[requestTypeSuggest] = m.suggest
	m.requestFuncMap[requestTypeTags] = m.tags
	m.requestFuncMap[requestTypeImpostor] = m.impostor
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
