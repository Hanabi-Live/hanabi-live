package main

import (
	"fmt"
	"os/exec"
	"path"
	"strconv"
	"time"
)

func shutdown(restart bool) {
	var verb string
	if restart {
		verb = "restart"
	} else {
		verb = "shutdown"
	}

	numGames := countActiveTables()
	logger.Info("Initiating a graceful server " + verb + " " +
		"(with " + strconv.Itoa(numGames) + " active games).")
	if numGames == 0 {
		shutdownImmediate(restart)
	} else {
		// Notify the lobby and all ongoing tables
		shuttingDown = true
		datetimeShutdownInit = time.Now()
		notifyAllShutdown()
		numMinutes := fmt.Sprintf("%f", shutdownTimeout.Minutes())
		chatServerSendAll("The server will " + verb + " in " + numMinutes + " minutes " +
			"or when all ongoing games have finished, whichever comes first. " +
			"New game creation has been disabled.")
		go shutdownXMinutesLeft(verb)
		go shutdownWait(restart)
	}
}

func shutdownXMinutesLeft(verb string) {
	minutesLeft := 5
	time.Sleep(shutdownTimeout - time.Duration(minutesLeft)*time.Minute)

	if !shuttingDown {
		return
	}

	msg := "The server will " + verb + " in " + strconv.Itoa(minutesLeft) + " minutes. " +
		"Finish your game soon or it will be automatically terminated!"
	for _, t := range tables {
		t.NotifyChat(&ChatMessage{
			Msg:      msg,
			Server:   true,
			Datetime: time.Now(),
		})
	}
}

func shutdownWait(restart bool) {
	for {
		if !shuttingDown {
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

			if restart {
				logger.Info("Restarting now.")
			} else {
				logger.Info("Shutting down now.")
			}
			shutdownImmediate(restart)
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

func shutdownImmediate(restart bool) {
	var verb string
	if restart {
		verb = "restart"
	} else {
		verb = "shutdown"
	}
	logger.Info("Initiating a server " + verb + ".")

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
		execute("build_client.sh", projectPath)
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

func maintenance() {
	shuttingDown = true
	notifyAllShutdown()
	chatServerSendAll("The server is entering maintenance mode. " +
		"New game creation has been disabled.")
}

func cancel() {
	shuttingDown = false
	notifyAllShutdown()
	chatServerSendAll("Server restart/maintenance has been canceled. " +
		"New game creation has been enabled.")
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
