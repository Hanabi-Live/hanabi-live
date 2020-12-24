package sessions

import (
	"nhooyr.io/websocket"
)

// send sends a command to a particular user.
// It never blocks, so commands to slow sessions are dropped.
func (m *Manager) send(userID int, commandName string, commandData interface{}) {
	// Server tasks and fake users use IDs with negative values
	if userID < 0 {
		m.logger.Errorf(
			"Attempted to send a \"%v\" command to negative user ID: %v",
			commandName,
			userID,
		)
		return
	}

	var msg string
	if v, err := packMsg(commandName, commandData); err != nil {
		m.logger.Errorf(
			"Failed to marshal the data when sending a \"%v\" command to WebSocket user %v: %v",
			commandName,
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

func (m *Manager) sendAll(commandName string, commandData interface{}) {
	var msg string
	if v, err := packMsg(commandName, commandData); err != nil {
		m.logger.Errorf(
			"Failed to marshal the data when sending a \"%v\" command to all WebSocket users: %v",
			commandName,
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
