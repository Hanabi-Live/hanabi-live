package table

import (
	"fmt"
	"math"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

const (
	secondsInAMinute = 60
)

type startInData struct {
	userID        int
	minutesToWait float64
}

func (m *Manager) StartIn(userID int, minutesToWait float64) {
	m.newRequest(requestTypeStartIn, &startInData{ // nolint: errcheck
		userID:        userID,
		minutesToWait: minutesToWait,
	})
}

func (m *Manager) startIn(data interface{}) {
	var d *startInData
	if v, ok := data.(*startInData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return
	} else {
		d = v
	}

	if m.table.Running {
		m.Dispatcher.Chat.ChatServer(constants.NotStartedFail, m.table.getRoomName())
		return
	}

	if d.userID != m.table.OwnerID {
		m.Dispatcher.Chat.ChatServer(constants.NotOwnerFail, m.table.getRoomName())
		return
	}

	secondsToWait := int(math.Ceil(d.minutesToWait * secondsInAMinute))
	timeToWait := time.Duration(secondsToWait) * time.Second
	timeToStart := time.Now().Add(timeToWait)
	m.table.DatetimePlannedStart = timeToStart

	var startTimeString string
	if secondsToWait < secondsInAMinute {
		startTimeString = fmt.Sprintf("%v seconds", secondsToWait)
	} else if secondsToWait == secondsInAMinute {
		startTimeString += "1 minute"
	} else {
		startTimeString += fmt.Sprintf("%v minutes", d.minutesToWait)
	}

	msg := fmt.Sprintf("The game will automatically start in %v.", startTimeString)
	m.Dispatcher.Chat.ChatServer(msg, m.table.getRoomName())

	go m.startInWait(timeToWait, timeToStart)
}

// startInWait is meant to be run in a goroutine.
func (m *Manager) startInWait(timeToWait time.Duration, datetimePlannedStart time.Time) {
	// Sleep until it is time to automatically start the game
	time.Sleep(timeToWait)

	m.StartInWaitComplete(datetimePlannedStart)
}
