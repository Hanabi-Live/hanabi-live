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
			t.IdleEnd()
			return
		}
	}
}

// EndIdle is called when a table has been idle for a while and should be automatically ended
func (t *table) idleEnd() {
	// Local variables
	m := t.manager

	m.logger.Infof("%v - Idle timeout has elapsed; ending the game.", t.getName())

	if t.Replay {
		// If this is a replay,
		// we want to send a message to the client that will take them back to the lobby
		t.NotifyBoot()
	}

	// Boot all of the spectators, if any
	for len(t.Spectators) > 0 {
		sp := t.Spectators[0]
		s := sp.Session
		if s == nil {
			// A spectator's session should never be nil
			// They might be in the process of reconnecting,
			// so make a fake session that will represent them
			s = NewFakeSession(sp.UserID, sp.Name)
			hLog.Info("Created a new fake session.")
		}
		commandTableUnattend(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID:      t.ID,
			NoTableLock:  true,
			NoTablesLock: true,
		})
	}

	if t.Replay {
		// If this is a replay, then we are done;
		// it should automatically end now that all of the spectators have left
		return
	}

	s := t.GetOwnerSession()
	if t.Running {
		// We need to end a game that has started
		// (this will put everyone in a non-shared replay of the idle game)
		commandAction(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID: t.ID,
			Type:    constants.ActionTypeEndGame,
			Target:  serverPlayerTargetIndex,
			Value:   constants.EndConditionIdleTimeout,
		})
	} else {
		// We need to end a game that has not started yet
		// Force the owner to leave, which should subsequently eject everyone else
		// (this will send everyone back to the main lobby screen)
		commandTableLeave(ctx, s, &CommandData{ // nolint: exhaustivestruct
			TableID: t.ID,
		})
	}
}
