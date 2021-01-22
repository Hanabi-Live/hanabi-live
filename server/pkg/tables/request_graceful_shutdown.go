package tables

import (
	"fmt"
	"strconv"
	"time"

	"github.com/Zamiell/hanabi-live/server/pkg/constants"
)

type gracefulShutdownData struct {
	datetimeShutdownInit time.Time
}

func (m *Manager) GracefulShutdown(datetimeShutdownInit time.Time) {
	m.newRequest(requestTypeJoin, &gracefulShutdownData{ // nolint: errcheck
		datetimeShutdownInit: datetimeShutdownInit,
	})
}

func (m *Manager) gracefulShutdown(data interface{}) interface{} {
	var d *gracefulShutdownData
	if v, ok := data.(*gracefulShutdownData); !ok {
		m.logger.Errorf("Failed type assertion for data of type: %T", d)
		return false
	} else {
		d = v
	}

	numActiveTables := m.getNumActiveTables()
	m.logger.Infof(
		"Initiating a graceful server shutdown (with %v active tables).",
		numActiveTables,
	)

	if numActiveTables == 0 {
		m.Dispatcher.Core.Shutdown()
	} else {
		m.Dispatcher.Sessions.NotifyAllShutdown(true, d.datetimeShutdownInit)

		numMinutes := strconv.Itoa(int(constants.ShutdownTimeout.Minutes()))
		msg := fmt.Sprintf("The server will shutdown in %v minutes.", numMinutes)
		m.Dispatcher.Chat.ChatServer(msg, constants.Lobby)

		go m.shutdownXMinutesLeft(5)
		go m.shutdownXMinutesLeft(10)
		go m.shutdownWait(d.datetimeShutdownInit)
	}

	return true
}

func (m *Manager) getNumActiveTables() int {
	numTables := 0
	for _, t := range m.tables {
		if t.Running() && !t.Replay() {
			numTables++
		}
	}

	return numTables
}

func (m *Manager) shutdownXMinutesLeft(minutesLeft int) {
	time.Sleep(constants.ShutdownTimeout - time.Duration(minutesLeft)*time.Minute)

	// Do nothing if the shutdown was canceled
	if !m.Dispatcher.Core.ShuttingDown() {
		return
	}

	if minutesLeft == 5 {
		// Terminate all unstarted tables, since they will almost certainly not have time to finish
		m.terminateAllUnstartedTables()
	}

	// Send a warning message to the lobby
	msg := fmt.Sprintf("The server will shutdown in %v minutes.", minutesLeft)
	m.Dispatcher.Chat.ChatServer(msg, constants.Lobby)

	// Send a warning message to the people still playing
	msg += " Finish your game soon or it will be automatically terminated!"
	for _, t := range m.tables {
		t.ChatServer(msg)
	}
}

func (m *Manager) shutdownWait(datetimeShutdownInit time.Time) {
	for {
		if m.shutdownWaitCheck(datetimeShutdownInit) {
			break
		}

		time.Sleep(time.Second)
	}
}

// shutdownWaitSub runs at an interval while the server is waiting to shutdown
// It returns whether or not to break out of the infinite loop
func (m *Manager) shutdownWaitCheck(datetimeShutdownInit time.Time) bool {
	if !m.Dispatcher.Core.ShuttingDown() {
		m.logger.Info("tablesManager - The shutdown was aborted.")
		return true
	}

	numActiveTables := m.getNumActiveTables()
	if numActiveTables == 0 {
		// Wait 10 seconds so that the players are not immediately booted upon finishing
		time.Sleep(time.Second * 10)

		m.logger.Info("tablesManager - There are 0 active tables left.")
		m.Dispatcher.Core.Shutdown()
		return true
	}

	if numActiveTables > 0 && time.Since(datetimeShutdownInit) >= constants.ShutdownTimeout {
		// It has been a long time since the server shutdown/restart was initiated,
		// so automatically terminate any remaining ongoing games
		m.terminateAllStartedTables()
	}

	return false
}

func (m *Manager) terminateAllUnstartedTables() {
	for tableID, t := range m.tables {
		if !t.Running() {
			m.delete(tableID, t)
		}
	}
}

func (m *Manager) terminateAllStartedTables() {
	for _, t := range m.tables {
		t.TerminateServer()
	}
}
