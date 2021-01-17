package sessions

import (
	"fmt"

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

	var s *session
	if v, ok := m.sessions[userID]; !ok {
		// Other server components might be trying to send a message to a user who has already
		// disconnected, so just ignore this request
		return
	} else {
		s = v
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

// sendWithChannelBypass is used when we need to synchronously send a message directly to a session
// without going through the normal send channel. This is used during before the session's channel
// monitoring goroutine has been initialized.
func (m *Manager) sendWithChannelBypass(s *session, commandName string, commandData interface{}) error {
	var msg string
	if v, err := packMsg(commandName, commandData); err != nil {
		return fmt.Errorf(
			"failed to marshal the data when sending a \"%v\" command to WebSocket user %v: %w",
			commandName,
			s.userID,
			err,
		)
	} else {
		msg = v
	}

	if err := writeToConnWithTimeout(s.ctx, s.conn, msg); err != nil {
		return err
	}

	return nil
}
