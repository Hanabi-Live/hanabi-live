package main

import (
	"runtime"
	"strconv"
	"time"

	"github.com/tevino/abool"
)

var (
	shuttingDown             = abool.New()
	blockAllIncomingMessages = abool.New()
	datetimeShutdownInit     time.Time
)

func shutdown() {
	shuttingDown.Set()
	datetimeShutdownInit = time.Now()

	numGames := countActiveTables()
	logger.Info("Initiating a graceful server shutdown (with " + strconv.Itoa(numGames) +
		" active games).")
	if numGames == 0 {
		shutdownImmediate()
	} else {
		// Notify the lobby and all ongoing tables
		notifyAllShutdown()
		numMinutes := strconv.Itoa(int(ShutdownTimeout.Minutes()))
		chatServerSendAll("The server will shutdown in " + numMinutes + " minutes.")
		go shutdownXMinutesLeft(5)
		go shutdownXMinutesLeft(10)
		go shutdownWait()
	}
}

func shutdownXMinutesLeft(minutesLeft int) {
	time.Sleep(ShutdownTimeout - time.Duration(minutesLeft)*time.Minute)

	// Do nothing if the shutdown was canceled
	if shuttingDown.IsNotSet() {
		return
	}

	// Automatically end all unstarted tables,
	// since they will almost certainly not have time to finish
	if minutesLeft == 5 {
		unstartedTableIDs := make([]uint64, 0)

		tablesMutex.RLock()
		for _, t := range tables {
			if !t.Running {
				unstartedTableIDs = append(unstartedTableIDs, t.ID)
			}
		}
		tablesMutex.RUnlock()

		for _, unstartedTableID := range unstartedTableIDs {
			t, exists := getTableAndLock(nil, unstartedTableID, true)
			if !exists {
				continue
			}

			s := t.GetOwnerSession()
			commandTableLeave(s, &CommandData{ // Manual invocation
				TableID: t.ID,
				NoLock:  true,
			})
			t.Mutex.Unlock()
		}
	}

	// Send a warning message to the lobby
	msg := "The server will shutdown in " + strconv.Itoa(minutesLeft) + " minutes."
	chatServerSend(msg, "lobby")

	// Send a warning message to the people still playing
	roomNames := make([]string, 0)
	tablesMutex.RLock()
	for _, t := range tables {
		roomNames = append(roomNames, t.GetRoomName())
	}
	tablesMutex.RUnlock()

	msg += " Finish your game soon or it will be automatically terminated!"
	for _, roomName := range roomNames {
		chatServerSend(msg, roomName)
	}
}

func shutdownWait() {
	for {
		if shuttingDown.IsNotSet() {
			logger.Info("The shutdown was aborted.")
			break
		}

		if countActiveTables() > 0 && time.Since(datetimeShutdownInit) >= ShutdownTimeout {
			// It has been a long time since the server shutdown/restart was initiated,
			// so automatically terminate any remaining ongoing games
			tableIDsToTerminate := make([]uint64, 0)
			tablesMutex.RLock()
			for _, t := range tables {
				if t.Running && !t.Replay {
					tableIDsToTerminate = append(tableIDsToTerminate, t.ID)
				}
			}
			tablesMutex.RUnlock()

			for _, tableIDToTerminate := range tableIDsToTerminate {
				t, exists := getTableAndLock(nil, tableIDToTerminate, true)
				if !exists {
					continue
				}

				s := t.GetOwnerSession()
				commandAction(s, &CommandData{ // Manual invocation
					TableID: t.ID,
					Type:    ActionTypeEndGame,
					Target:  -1,
					Value:   EndConditionTerminated,
					NoLock:  true,
				})
				t.Mutex.Unlock()
			}
		}

		if countActiveTables() == 0 {
			// Wait 10 seconds so that the players are not immediately booted upon finishing
			time.Sleep(time.Second * 10)

			logger.Info("There are 0 active tables left.")
			shutdownImmediate()
			break
		}

		time.Sleep(time.Second)
	}
}

func countActiveTables() int {
	tablesMutex.RLock()
	defer tablesMutex.RUnlock()

	numTables := 0
	for _, t := range tables {
		if t.Running && !t.Replay {
			numTables++
		}
	}

	return numTables
}

func shutdownImmediate() {
	logger.Info("Initiating an immediate server shutdown.")

	waitForAllWebSocketCommandsToFinish()

	sessionsMutex.RLock()
	for _, s := range sessions {
		s.Error("The server is going down for scheduled maintenance.<br />" +
			"The server might be down for a while; " +
			"please see the Discord server for more specific updates.")
		s.NotifySoundLobby("shutdown")
	}
	sessionsMutex.RUnlock()

	msg := "The server successfully shut down at: " + getCurrentTimestamp()
	chatServerSend(msg, "lobby")

	if runtime.GOOS == "windows" {
		logger.Info("Manually kill the server now.")
	} else if err := executeScript("stop.sh"); err != nil {
		logger.Error("Failed to execute the \"stop.sh\" script:", err)
	}
}

func cancel() {
	shuttingDown.UnSet()
	notifyAllShutdown()
	chatServerSendAll("Server shutdown has been canceled.")
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
	blockAllIncomingMessages.Set()
	commandWaitGroup.Wait() // Will block until it the counter becomes 0
	logger.Info("All WebSocket commands have completed.")
}
