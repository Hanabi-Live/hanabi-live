package main

import (
	"os/exec"
	"path"
	"time"
)

func restart(s *Session, d *CommandData) {
	// Validate that they are an administrator
	if !s.Admin() {
		return
	}

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

	shutdownMode = 1
	go gracefulWait()
}

func gracefulWait() {
	for {
		if shutdownMode == 0 {
			log.Info("The shutdown was aborted.")
			break
		}

		// Check to see if all games are finished
		if len(games) == 0 {
			// Wait 10 seconds so that the players are not immediately booted upon finishing
			time.Sleep(time.Second * 10)

			restart2()
			break
		}

		time.Sleep(time.Second)
	}
}

func execute(script string) {
	cmd := exec.Command(path.Join(projectPath, script)) // nolint: gas
	if output, err := cmd.Output(); err != nil {
		log.Error("Failed to execute \""+script+"\":", err)
	} else {
		log.Info("\""+script+"\" completed:", string(output))
	}
}
