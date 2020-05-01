package main

import (
	"encoding/json"
	"io/ioutil"
	"os/exec"
	"path"
	"strconv"
	"time"
)

var (
	shuttingDown         = false
	datetimeShutdownInit time.Time
)

// We want to record all of the ongoing games to a flat file on the disk
// This allows the server to restart without waiting for ongoing games to finish
func restart() {
	// We build the client first before kicking everyone off in order to
	// reduce the total amount of downtime
	logger.Info("Building the client...")
	// execute("build_client.sh", projectPath)

	for _, t := range tables {
		// Only serialize ongoing games
		if !t.Running || t.Replay {
			continue
		}

		// First, nullify the sessions, since it is not necessary to serialize those
		for _, p := range t.Players {
			p.Session = nil
		}
		for _, sp := range t.Spectators {
			sp.Session = nil
		}

		var tableJSON []byte
		if v, err := json.Marshal(t); err != nil {
			logger.Error("Failed to marshal table "+strconv.Itoa(t.ID)+":", err)
			return
		} else {
			tableJSON = v
		}

		tablePath := path.Join(tablesPath, strconv.Itoa(t.ID)+".json")
		if err := ioutil.WriteFile(tablePath, tableJSON, 0644); err != nil {
			logger.Error("Failed to write the table "+strconv.Itoa(t.ID)+" to "+
				"\""+tablePath+"\":", err)
			return
		}
	}

	logger.Info("Finished writing all tables to disk. Restarting...")
	execute("restart.sh", projectPath)
}

func shutdown() {
	shuttingDown = true
	datetimeShutdownInit = time.Now()

	numGames := countActiveTables()
	logger.Info("Initiating a graceful server shutdown " +
		"(with " + strconv.Itoa(numGames) + " active games).")
	if numGames == 0 {
		shutdownImmediate()
	} else {
		// Notify the lobby and all ongoing tables
		notifyAllShutdown()
		numMinutes := strconv.Itoa(int(shutdownTimeout.Minutes()))
		chatServerSendAll("The server will shutdown in " + numMinutes + " minutes or " +
			"when all ongoing games have finished, whichever comes first.")
		go shutdownXMinutesLeft(5)
		go shutdownXMinutesLeft(10)
		go shutdownWait()
	}
}

func shutdownXMinutesLeft(minutesLeft int) {
	time.Sleep(shutdownTimeout - time.Duration(minutesLeft)*time.Minute)

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

	for _, s := range sessions {
		s.Error("The server is going down for scheduled maintenance. The server might be " +
			"down for a while; please see the Discord server for more specific updates.")
	}

	commandChat(nil, &CommandData{
		Msg:    "The server successfully shut down at: " + getCurrentTimestamp(),
		Room:   "lobby",
		Server: true,
		Spam:   true,
	})
	execute("stop.sh", projectPath)
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

	timeLeft := shutdownTimeout - time.Since(datetimeShutdownInit)
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
