package tables

import (
	"fmt"
	"strconv"
	"strings"
)

type printData struct {
	resultsChannel chan string
}

// Print requests a description of all current user to table relationships.
// It will block until the message is received.
func (m *Manager) Print() string {
	resultsChannel := make(chan string)

	if err := m.newRequest(requestTypePrint, &printData{
		resultsChannel: resultsChannel,
	}); err != nil {
		return err.Error()
	}

	return <-resultsChannel
}

func (m *Manager) print(data interface{}) {
	var d *printData
	if v, ok := data.(*printData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	msg := "Playing relationships:\n"
	msg += printUsersMap(m.usersPlaying)
	msg += "\n"
	msg += "Spectating relationships:\n"
	msg += printUsersMap(m.usersSpectating)
	msg += "\n"

	d.resultsChannel <- msg
}

func printUsersMap(usersMap map[int][]uint64) string {
	msg := ""
	for userID, tableIDs := range usersMap {
		tableIDStrings := make([]string, 0)
		for _, tableID := range tableIDs {
			tableIDStrings = append(tableIDStrings, strconv.FormatUint(tableID, 10))
		}
		tablesString := strings.Join(tableIDStrings, ", ")
		msg += fmt.Sprintf("  User %v --> Tables: [%v]\n", userID, tablesString)
	}

	return msg
}
