package core

import (
	"fmt"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

func (m *Manager) GetCameOnline() string {
	formattedDatetimestarted := util.FormatTimestampUnix(m.datetimeStarted)
	return fmt.Sprintf("The server came online at: %v", formattedDatetimestarted)
}

func (m *Manager) GetUptime() (string, error) {
	elapsedTime := time.Since(m.datetimeStarted)
	elapsedSeconds := int(elapsedTime.Seconds())
	var durationString string
	if v, err := util.SecondsToDurationString(elapsedSeconds); err != nil {
		return "", err
	} else {
		durationString = v
	}
	msg := fmt.Sprintf("Uptime: %v", durationString)
	return msg, nil
}
