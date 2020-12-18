package sessions

import (
	"nhooyr.io/websocket"
)

// send sends a command to a particular user.
// It never blocks, so commands to slow sessions are dropped.
func (m *Manager) send(userID int, command string, data interface{}) {
	var msg string
	if v, err := packMsg(command, data); err != nil {
		m.logger.Errorf(
			"Failed to marshal the data when sending a \"%v\" command to WebSocket user %v: %v",
			command,
			userID,
			err,
		)
		return
	} else {
		msg = v
	}

	var s *session
	if v, ok := m.sessions[userID]; !ok {
		// Other server components might be trying to send a message to a user who has already
		// disconnected, so just ignore this request
		return
	} else {
		s = v
	}

	putMsgOnChannel(msg, s)
}

func (m *Manager) sendAll(command string, data interface{}) {
	var msg string
	if v, err := packMsg(command, data); err != nil {
		m.logger.Errorf(
			"Failed to marshal the data when sending a \"%v\" command to all WebSocket users: %v",
			command,
			err,
		)
		return
	} else {
		msg = v
	}

	for _, s := range m.sessions {
		putMsgOnChannel(msg, s)
	}
}

func putMsgOnChannel(msg string, s *session) {
	select {
	case s.sendChannel <- msg:
	default:
		// The channel has filled up (e.g. "maxQueuedMessages")
		go func() {
			s.conn.Close(
				websocket.StatusPolicyViolation,
				"connection too slow to keep up with messages",
			)
		}()
	}
}
