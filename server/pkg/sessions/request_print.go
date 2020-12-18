package sessions

import (
	"fmt"
)

type printData struct {
	resultsChannel chan string
}

// Print will return a description of all current sessions.
// It will block until the message is received.
func (m *Manager) Print() string {
	if m.requestsClosed.IsSet() {
		return "impending server termination"
	}

	resultsChannel := make(chan string)

	m.requests <- &request{
		Type: requestTypePrint,
		Data: &printData{
			resultsChannel: resultsChannel,
		},
	}

	return <-resultsChannel
}

func (m *Manager) print(data interface{}) {
	var d *printData
	if v, ok := data.(*printData); !ok {
		m.logger.Errorf("failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	msg := fmt.Sprintf("Current users (%v):\n", len(m.sessions))
	if len(m.sessions) == 0 {
		msg += "    [no users]\n"
	} else {
		for userID, s := range m.sessions {
			msg += fmt.Sprintf(
				"    User ID: %v, Username: %v, Status: %v\n",
				userID,
				s.username,
				s.status,
			)
		}
	}

	d.resultsChannel <- msg
}
