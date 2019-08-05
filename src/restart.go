package main

import (
	"os/exec"
	"path"
	"strconv"
	"time"
)

func restart() {
	log.Info("Initiating a server restart.")
	execute("build_client.sh", projectPath)
	for _, s := range sessions {
		s.Error("The server is going down for a scheduled restart. Please wait a few seconds and then refresh the page.")
	}
	execute("restart.sh", projectPath)
}

func graceful() {
	numGames := countActiveTables()
	log.Info("Initiating a graceful server restart " +
		"(with " + strconv.Itoa(numGames) + " active games).")
	if numGames == 0 {
		restart()
	} else {
		shuttingDown = true
		go gracefulWait()
		chatServerSend("The server will restart when all ongoing games have finished. "+
			"New game creation has been disabled.", "lobby")
	}
}

func gracefulWait() {
	for {
		if !shuttingDown {
			log.Info("The shutdown was aborted.")
			break
		}

		if countActiveTables() == 0 {
			// Wait 10 seconds so that the players are not immediately booted upon finishing
			time.Sleep(time.Second * 10)

			log.Info("Restarting now.")
			restart()
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

func execute(script string, cwd string) {
	cmd := exec.Command(path.Join(cwd, script))
	cmd.Dir = cwd
	if output, err := cmd.CombinedOutput(); err != nil {
		log.Error("Failed to execute \""+script+"\":", err)
		if string(output) != "" {
			log.Error("Output is as follows:")
			log.Error(string(output))
		}
	} else {
		log.Info("\""+script+"\" completed:", string(output))
	}
}
