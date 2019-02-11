package main

import (
	"os/exec"
	"path"
	"strconv"
	"time"
)

func restart(s *Session, d *CommandData) {
	if !isAdmin(s, d) {
		return
	}

	log.Info("Initiating a server restart.")
	restart2()
}

func restart2() {
	execute("pull.sh")
	execute("build_client.sh")
	// Even though this is included in the "restart.sh" script, it won't execute for some reason,
	// so call it here manually
	execute("restart.sh")
}

func graceful(s *Session, d *CommandData) {
	if !isAdmin(s, d) {
		return
	}

	graceful2()
}

func graceful2() {
	numGames := countActiveGames()
	log.Info("Initiating a graceful server restart " +
		"(with " + strconv.Itoa(numGames) + " active games).")
	if numGames == 0 {
		restart2()
	} else {
		shutdownMode = 1
		go gracefulWait()
		chatServerSend("The server will restart when all ongoing games have finished. " +
			"New game creation has been disabled.")
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

func ungraceful(s *Session, d *CommandData) {
	if !isAdmin(s, d) {
		return
	}

	shutdownMode = 0
	chatServerSend("Server restart has been canceled. New game creation has been enabled.")
}

/*
	Subroutines
*/

func isAdmin(s *Session, d *CommandData) bool {
	// Validate that this message was sent from the lobby
	if d.Discord {
		chatServerSend("You can only perform that command from the lobby.")
		return false
	}

	// Validate that they are an administrator
	if !s.Admin() {
		chatServerSend("You can only perform that command if you are an administrator.")
		return false
	}

	return true
}

func execute(script string) {
	cmd := exec.Command(path.Join(projectPath, script))
	if output, err := cmd.Output(); err != nil {
		log.Error("Failed to execute \""+script+"\":", err)
		log.Error("Output is as follows:")
		log.Error(string(output))
	} else {
		log.Info("\""+script+"\" completed:", string(output))
	}
}
