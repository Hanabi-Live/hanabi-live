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
	resultsChannel := make(chan string)

	if err := m.newRequest(requestTypePrint, &printData{
		resultsChannel: resultsChannel,
	}); err != nil {
		return "impending server termination"
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
