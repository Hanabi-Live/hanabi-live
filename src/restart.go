package main

import (
	"os/exec"
	"path"
	"strconv"
	"time"
)

func restart(s *Session, d *CommandData) {
	// Validate that they are an administrator
	if !s.Admin() {
		return
	}

	log.Info("Initiating a server restart.")
	restart2()
}

func restart2() {
	execute("pull.sh")
	execute("restart.sh")
}

func graceful(s *Session, d *CommandData) {
	// Validate that they are an administrator
	if !s.Admin() {
		return
	}

	numGames := countActiveGames()
	log.Info("Initiating a graceful server restart (with " + strconv.Itoa(numGames) + " active games).")
	if numGames == 0 {
		restart2()
	} else {
		shutdownMode = 1
		go gracefulWait()
	}
}

func gracefulWait() {
	for {
		if shutdownMode == 0 {
			log.Info("The shutdown was aborted.")
			break
		}

		if countActiveGames() == 0 {
			// Wait 10 seconds so that the players are not immediately booted upon finishing
			time.Sleep(time.Second * 10)

			log.Info("Restarting now.")
			restart2()
			break
		}

		time.Sleep(time.Second)
	}
}

func countActiveGames() int {
	numGames := 0
	for _, g := range games {
		if !g.Running {
			continue
		}
		if g.SharedReplay {
			continue
		}
		numGames++
	}

	return numGames
}

func execute(script string) {
	cmd := exec.Command(path.Join(projectPath, script)) // nolint: gas
	if output, err := cmd.Output(); err != nil {
		log.Error("Failed to execute \""+script+"\":", err)
	} else {
		log.Info("\""+script+"\" completed:", string(output))
	}
}
