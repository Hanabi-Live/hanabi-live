package table

import (
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

// idleDetector sleeps and checks to see if the table should be terminated due to idleness.
// This is useful because we want to automatically clean up idle games to prevent the lobby getting
// cluttered.
// idleDetector is meant to be run in a new goroutine.
func (t *table) idleDetector() {
	for {
		possibleIdleTimeoutTime := t.datetimeLastAction.Add(constants.IdleGameTimeout)
		timeToWait := time.Until(possibleIdleTimeoutTime)

		// Sleep until a potential idle timeout can happen or the table shuts down,
		// whichever happens first
		select {
		case <-time.After(timeToWait):
			break
		case <-t.idleDetectorChannel:
			// Any value received on this channel indicates that the table is shutting down
			return
		}

		if time.Since(t.datetimeLastAction) >= constants.IdleGameTimeout {
			t.idleEnd()
			return
		}
	}
}
