package main

import (
	"os/exec"
	"path"
	"strconv"
	"time"
)

var (
	shutdownMode         = shutdownModeNone // See "constants.go"
	datetimeShutdownInit time.Time
)

func shutdown(restart bool) {
	var verb string
	if restart {
		verb = "restart"
		shutdownMode = shutdownModeRestart
	} else {
		verb = "shutdown"
		shutdownMode = shutdownModeShutdown
	}
	datetimeShutdownInit = time.Now()

	numGames := countActiveTables()
	logger.Info("Initiating a graceful server " + verb + " " +
		"(with " + strconv.Itoa(numGames) + " active games).")
	if numGames == 0 {
		shutdownImmediate(restart, verb)
	} else {
		// Notify the lobby and all ongoing tables
		notifyAllShutdown()
		numMinutes := strconv.Itoa(int(shutdownTimeout.Minutes()))
		chatServerSendAll("The server will " + verb + " in " + numMinutes + " minutes or " +
			"when all ongoing games have finished, whichever comes first.")
		go shutdownXMinutesLeft(5, verb)
		go shutdownXMinutesLeft(10, verb)
		go shutdownWait(restart, verb)
	}
}

func shutdownXMinutesLeft(minutesLeft int, verb string) {
	time.Sleep(shutdownTimeout - time.Duration(minutesLeft)*time.Minute)

	if shutdownMode == shutdownModeNone {
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
	msg := "The server will " + verb + " in " + strconv.Itoa(minutesLeft) + " minutes."
	chatServerSend(msg, "lobby")
	msg += " Finish your game soon or it will be automatically terminated!"
	for _, t := range tables {
		chatServerSend(msg, "table"+strconv.Itoa(t.ID))
	}
}

func shutdownWait(restart bool, verb string) {
	for {
		if shutdownMode == shutdownModeNone {
			logger.Info("The shutdown was aborted.")
			break
		}

		if countActiveTables() > 0 && time.Since(datetimeShutdownInit) >= shutdownTimeout {
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
			shutdownImmediate(restart, verb)
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

func shutdownImmediate(restart bool, verb string) {
	logger.Info("Initiating an immediate server " + verb + ".")

	if restart {
		// We build the client first before kicking everyone off in order to reduce the total amount
		// of downtime
		logger.Info("Building the client...")
		execute("build_client.sh", projectPath)
	}

	for _, s := range sessions {
		if restart {
			s.Error("The server is going down for a scheduled restart. " +
				"Please wait a few seconds and then refresh the page.")
		} else {
			s.Error("The server is going down for scheduled maintenance. The server might be " +
				"down for a while; please see the Discord server for more specific updates.")
		}
	}

	if restart {
		execute("restart.sh", projectPath)
	} else {
		commandChat(nil, &CommandData{
			Msg:    "The server successfully shut down at: " + getCurrentTimestamp(),
			Room:   "lobby",
			Server: true,
			Spam:   true,
		})
		execute("stop.sh", projectPath)
	}
}

func cancel() {
	var verb string
	if shutdownMode == shutdownModeRestart {
		verb = "restart"
	} else if shutdownMode == shutdownModeShutdown {
		verb = "shutdown"
	}
	shutdownMode = shutdownModeNone
	notifyAllShutdown()
	chatServerSendAll("Server " + verb + " has been canceled.")
}

func checkImminenntShutdown(s *Session) bool {
	if shutdownMode == shutdownModeNone {
		return false
	}

	timeLeft := shutdownTimeout - time.Since(datetimeShutdownInit)
	minutesLeft := int(timeLeft.Minutes())
	if minutesLeft <= 5 {
		var verb string
		if shutdownMode == shutdownModeRestart {
			verb = "restarting"
		} else if shutdownMode == shutdownModeShutdown {
			verb = "shutting down"
		}

		msg := "The server is " + verb + " "
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

/*
	Subroutines
*/

func execute(script string, cwd string) {
	cmd := exec.Command(path.Join(cwd, script)) // nolint:gosec
	cmd.Dir = cwd
	if output, err := cmd.CombinedOutput(); err != nil {
		logger.Error("Failed to execute \""+script+"\":", err)
		if string(output) != "" {
			logger.Error("Output is as follows:")
			logger.Error(string(output))
		}
	} else {
		logger.Info("\""+script+"\" completed:", string(output))
	}
}
