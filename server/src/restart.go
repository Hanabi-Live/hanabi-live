package main

import (
	"runtime"
)

// We want to record all of the ongoing games to a flat file on the disk
// This allows the server to restart without waiting for ongoing games to finish
func restart() {
	logger.Info("Initiating a server graceful restart.")

	// We build the client and the server first before kicking everyone off in order to reduce the
	// total amount of downtime (but executing Bash scripts will not work on Windows)
	if runtime.GOOS != "windows" {
		logger.Info("Building the client...")
		if err := executeScript("client/build_client.sh"); err != nil {
			logger.Error("Failed to execute the \"build_client.sh\" script:", err)
			return
		}

		logger.Info("Building the server...")
		if err := executeScript("server/build_server.sh"); err != nil {
			logger.Error("Failed to execute the \"build_server.sh\" script:", err)
			return
		}
	}

	waitForAllWebSocketCommandsToFinish()

	logger.Info("Serializing the tables and writing all tables to disk...")
	if !serializeTables() {
		return
	}
	logger.Info("Finished writing all tables to disk.")

	sessionsMutex.RLock()
	for _, s := range sessions {
		// The sound has to be before the error, since the latter will cause a disconnect
		s.NotifySoundLobby("shutdown")
		s.Error("The server is going down momentarily to load a new version of the code.<br />" +
			"If you are currently playing a game, all of the progress should be saved.<br />" +
			"Please wait a few seconds and then refresh the page.")
	}
	sessionsMutex.RUnlock()

	msg := "The server went down for a restart at: " + getCurrentTimestamp() + "\n"
	msg += "(" + gitCommitOnStart + ")"
	chatServerSend(msg, "lobby")

	if runtime.GOOS != "windows" {
		logger.Info("Restarting...")
		if err := executeScript("restart_service_only.sh"); err != nil {
			logger.Error("Failed to execute the \"restart_service_only.sh\" script:", err)
			return
		}
	} else {
		logger.Info("Manually kill the server now.")
	}
}
