package sessions

import (
	"nhooyr.io/websocket"
)

type sendMsgData struct {
	userID int
	msg    []byte
}

func (m *Manager) SendMsg(userID int, msg []byte) {
	m.requests <- &request{
		Type: requestTypeSendMsg,
		Data: &sendMsgData{
			userID: userID,
			msg:    msg,
		},
	}
}

// sendMsg sends a message to a particular user.
// It never blocks, so messages to slow sessions are dropped.
func sendMsg(m *Manager, rawData interface{}) {
	var data *sendMsgData
	if v, ok := rawData.(*sendMsgData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", data)
		return
	} else {
		data = v
	}

	s := m.sessions[data.userID]

	select {
	case s.sendChannel <- data.msg:
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
