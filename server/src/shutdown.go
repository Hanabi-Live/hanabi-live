package main

import (
	"context"
	"runtime"
	"strconv"
	"time"

	"github.com/Hanabi-Live/hanabi-live/logger"
	"github.com/tevino/abool"
)

var (
	shuttingDown         = abool.New()
	datetimeShutdownInit time.Time
)

func shutdown(ctx context.Context) {
	shuttingDown.Set()
	datetimeShutdownInit = time.Now()

	numGames := countActiveTables(ctx)
	logger.Info("Initiating a graceful server shutdown (with " + strconv.Itoa(numGames) +
		" active games).")
	if numGames == 0 {
		shutdownImmediate(ctx)
	} else {
		// Notify the lobby and all ongoing tables
		notifyAllShutdown()
		numMinutes := strconv.Itoa(int(ShutdownTimeout.Minutes()))
		chatServerSendAll(ctx, "The server will shutdown in "+numMinutes+" minutes.")
		go shutdownXMinutesLeft(ctx, 5)
		go shutdownXMinutesLeft(ctx, 10)
		go shutdownWait(ctx)
	}
}

func shutdownXMinutesLeft(ctx context.Context, minutesLeft int) {
	time.Sleep(ShutdownTimeout - time.Duration(minutesLeft)*time.Minute)

	// Do nothing if the shutdown was canceled
	if shuttingDown.IsNotSet() {
		return
	}

	if minutesLeft == 5 {
		// Automatically end all unstarted tables,
		// since they will almost certainly not have time to finish
		terminateAllUnstartedTables(ctx)
	}

	// Send a warning message to the lobby
	msg := "The server will shutdown in " + strconv.Itoa(minutesLeft) + " minutes."
	chatServerSend(ctx, msg, "lobby", false)

	// Send a warning message to the people still playing
	tableList := tables.GetList(true)
	roomNames := make([]string, 0)
	for _, t := range tableList {
		t.Lock(ctx)
		roomNames = append(roomNames, t.GetRoomName())
		t.Unlock(ctx)
	}

	msg += " Finish your game soon or it will be automatically terminated!"
	for _, roomName := range roomNames {
		chatServerSend(ctx, msg, roomName, false)
	}
}

func terminateAllUnstartedTables(ctx context.Context) {
	for _, t := range tables.GetList(true) {
		t.Lock(ctx)
		if !t.Running {
			s := t.GetOwnerSession()
			tableID := t.ID
			t.Unlock(ctx)
			commandTableLeave(ctx, s, &CommandData{TableID: tableID}) // nolint: exhaustivestruct
			continue
		}
		t.Unlock(ctx)
	}
}

func shutdownWait(ctx context.Context) {
	for {
		if shutdownWaitSub(ctx) {
			break
		}

		time.Sleep(time.Second)
	}
}

// shutdownWaitSub runs at an interval while the server is waiting to shutdown
// It returns whether or not to break out of the infinite loop
func shutdownWaitSub(ctx context.Context) bool {
	if shuttingDown.IsNotSet() {
		logger.Info("The shutdown was aborted.")
		return true
	}

	numActiveTables := countActiveTables(ctx)

	if numActiveTables == 0 {
		// Wait 10 seconds so that the players are not immediately booted upon finishing
		time.Sleep(time.Second * 10)

		if shuttingDown.IsNotSet() {
			logger.Info("The shutdown was aborted.")
			return true
		}
		if countActiveTables(ctx) != 0 {
			return false
		}
		logger.Info("There are 0 active tables left.")
		shutdownImmediate(ctx)
		return true
	}

	if numActiveTables > 0 && time.Since(datetimeShutdownInit) >= ShutdownTimeout {
		// It has been a long time since the server shutdown/restart was initiated,
		// so automatically terminate any remaining ongoing games
		terminateAllStartedTables(ctx)
	}

	return false
}

func terminateAllStartedTables(ctx context.Context) {
	for _, t := range tables.GetList(true) {
		t.Lock(ctx)
		if t.Running && !t.Replay && !t.Ending {
			s := t.GetOwnerSession()
			tableID := t.ID
			t.Unlock(ctx)
			commandAction(ctx, s, &CommandData{ // nolint: exhaustivestruct
				TableID: tableID,
				Type:    ActionTypeEndGame,
				Target:  -1,
				Value:   EndConditionTerminatedByPlayer,
			})
			continue
		}
		t.Unlock(ctx)
	}
}

func countActiveTables(ctx context.Context) int {
	tableList := tables.GetList(true)
	numTables := 0
	for _, t := range tableList {
		t.Lock(ctx)
		if t.Running && !t.Replay && !t.EndingFailed {
			numTables++
		}
		t.Unlock(ctx)
	}

	return numTables
}

func shutdownImmediate(ctx context.Context) {
	serverLifecycleMutex.Lock()
	defer serverLifecycleMutex.Unlock()

	logger.Info("Initiating an immediate server shutdown.")

	waitForAllWebSocketCommandsToFinish()

	sessionList := sessions.GetList()
	for _, s := range sessionList {
		s.Error("The server is going down for scheduled maintenance.<br />" +
			"The server might be down for a while; " +
			"please see the Discord server for more specific updates.")
		s.NotifySoundLobby("shutdown")
	}

	msg := "The server successfully shut down at: " + getCurrentTimestamp()
	chatServerSend(ctx, msg, "lobby", false)

	if runtime.GOOS == "windows" {
		logger.Info("Manually kill the server now.")
	} else if err := executeScript("stop.sh"); err != nil {
		logger.Error("Failed to execute the \"stop.sh\" script: " + err.Error())
		shuttingDown.UnSet()
		notifyAllShutdown()
		incomingCommands.resume()
	}
}

func cancel(ctx context.Context) {
	shuttingDown.UnSet()
	notifyAllShutdown()
	chatServerSendAll(ctx, "Server shutdown has been canceled.")
}

func checkImminentShutdown(s *Session) bool {
	if shuttingDown.IsNotSet() {
		return false
	}

	timeLeft := ShutdownTimeout - time.Since(datetimeShutdownInit)
	minutesLeft := int(timeLeft.Minutes())
	if minutesLeft <= 5 {
		msg := "The server is shutting down "
		if minutesLeft == 0 {
			msg += "momentarily"
		} else if minutesLeft == 1 {
			msg += "in 1 minute"
		} else {
			msg += "in " + strconv.Itoa(minutesLeft) + " minutes"
		}
		msg += ". You cannot start any new games for the time being."
		s.Warning(msg)
		return true
	}

	return false
}

func waitForAllWebSocketCommandsToFinish() {
	logger.Info("Waiting for all ongoing WebSocket commands to finish execution...")
	incomingCommands.drain()
	logger.Info("All WebSocket commands have completed.")
}
