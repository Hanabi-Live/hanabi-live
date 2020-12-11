package sessions

import "fmt"

type printData struct {
	resultsChannel chan string
}

// Print is a helper function for getting a description of all current sessions.
// It will block until the message is received.
func (m *Manager) Print() string {
	resultsChannel := make(chan string)

	m.requests <- &request{
		Type: requestTypePrint,
		Data: &printData{
			resultsChannel: resultsChannel,
		},
	}

	return <-resultsChannel
}

func print(m *Manager, rawData interface{}) {
	var data *printData
	if v, ok := rawData.(*printData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", data)
		return
	} else {
		data = v
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

	data.resultsChannel <- msg
}
