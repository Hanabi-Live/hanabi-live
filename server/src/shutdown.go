package main

import (
	"runtime"
	"strconv"
	"time"
)

var (
	shuttingDown         = false
	datetimeShutdownInit time.Time
)

func shutdown() {
	shuttingDown = true
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
	if !shuttingDown {
		return
	}

	// Automatically end all unstarted games,
	// since they will almost certainly not have time to finish
	if minutesLeft == 5 {
		for _, t := range tables {
			if !t.Running {
				s := t.GetOwnerSession()
				commandTableLeave(s, &CommandData{
					TableID: t.ID,
				})
			}
		}
	}

	// Send a warning message to the lobby and to the people still playing
	msg := "The server will shutdown in " + strconv.Itoa(minutesLeft) + " minutes."
	chatServerSend(msg, "lobby")
	msg += " Finish your game soon or it will be automatically terminated!"
	for _, t := range tables {
		chatServerSend(msg, "table"+strconv.Itoa(t.ID))
	}
}

func shutdownWait() {
	for {
		if !shuttingDown {
			logger.Info("The shutdown was aborted.")
			break
		}

		if countActiveTables() > 0 && time.Since(datetimeShutdownInit) >= ShutdownTimeout {
			// It has been a long time since the server shutdown/restart was initiated,
			// so automatically terminate any remaining ongoing games
			for _, t := range tables {
				if t.Running && !t.Replay {
					terminate(t, "Hanabi Live", -1)
				}
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
	numTables := 0
	for _, t := range tables {
		if !t.Running || // Pre-game tables that have not started yet
			t.Replay { // Solo replays and shared replays

			continue
		}
		numTables++
	}

	return numTables
}

func shutdownImmediate() {
	logger.Info("Initiating an immediate server shutdown.")

	// Lock the command mutex to prevent any more moves from being submitted
	commandMutex.Lock()
	defer commandMutex.Unlock()

	for _, s := range sessions {
		s.Error("The server is going down for scheduled maintenance. " +
			"The server might be down for a while; please see the Discord server for more specific updates.")
	}

	commandChat(nil, &CommandData{
		Msg:    "The server successfully shut down at: " + getCurrentTimestamp(),
		Room:   "lobby",
		Server: true,
	})

	if runtime.GOOS != "windows" {
		if err := executeScript("stop.sh"); err != nil {
			logger.Error("Failed to execute the \"stop.sh\" script:", err)
		}
	} else {
		logger.Info("Manually kill the server now.")
	}

	// Block until the process is killed so that no more moves can be submitted
	select {}
}

func cancel() {
	shuttingDown = false
	notifyAllShutdown()
	chatServerSendAll("Server shutdown has been canceled.")
}

func checkImminenntShutdown(s *Session) bool {
	if !shuttingDown {
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
