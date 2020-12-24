package core

import (
	"fmt"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/util"
)

const (
	// shutdownTimeout is the amount of time that players have to finish their game once a graceful
	// server shutdown is initiated.
	shutdownTimeout                = time.Minute * 30
	minuteCutoffForNewGameCreation = 5
)

func (m *Manager) GetNewTableShutdownWarning() string {
	if m.shuttingDown.IsNotSet() {
		return ""
	}

	timeLeft := shutdownTimeout - time.Since(m.datetimeShutdownInit)
	minutesLeft := int(timeLeft.Minutes())

	return fmt.Sprintf(
		"The server is shutting down in %v minutes. Keep in mind that if your game is not finished in time, it will be terminated.",
		minutesLeft,
	)
}

func (m *Manager) GetShutdownTimeLeft() (string, error) {
	if m.shuttingDown.IsNotSet() {
		return "The server is not scheduled to shutdown any time soon.", nil
	}

	timeLeft := shutdownTimeout - time.Since(m.datetimeShutdownInit)
	timeLeftSeconds := int(timeLeft.Seconds())

	var durationString string
	if v, err := util.SecondsToDurationString(timeLeftSeconds); err != nil {
		return "", err
	} else {
		durationString = v
	}

	msg := fmt.Sprintf("Time left until server shutdown: %v", durationString)
	return msg, nil
}

func (m *Manager) IsNewTablesAllowed() (bool, string) {
	if m.maintenanceMode.IsSet() {
		msg := "The server is undergoing maintenance. You cannot start any new games for the time being."
		return false, msg
	}

	if m.shuttingDown.IsSet() {
		// Even if the server is shutting down,
		// we allow new tables to be created up until the cutoff time
		timeLeft := shutdownTimeout - time.Since(m.datetimeShutdownInit)
		minutesLeft := int(timeLeft.Minutes())
		if minutesLeft <= minuteCutoffForNewGameCreation {
			var timeString string
			if minutesLeft == 0 {
				timeString = "momentarily"
			} else if minutesLeft == 1 {
				timeString = "in 1 minute"
			} else {
				timeString = fmt.Sprintf("in %v minutes", minutesLeft)
			}

			msg := fmt.Sprintf(
				"The server is shutting down %v. You cannot start any new games for the time being.",
				timeString,
			)
			return false, msg
		}
	}

	return true, ""
}
