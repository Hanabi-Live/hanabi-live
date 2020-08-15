package main

import (
	"runtime"
)

// We want to record all of the ongoing games to a flat file on the disk
// This allows the server to restart without waiting for ongoing games to finish
func restart() {
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

	blockAllIncomingMessages.Set()

	logger.Info("Serializing the tables and writing all tables to disk...")
	if !serializeTables() {
		return
	}
	logger.Info("Finished writing all tables to disk.")

	for _, s := range sessions {
		s.Error("The server is going down momentarily to load a new version of the code. " +
			"If you are currently playing a game, all of the progress should be saved. " +
			"Please wait a few seconds and then refresh the page.")
	}

	commandChat(nil, &CommandData{
		Msg:    "The server went down for a restart at: " + getCurrentTimestamp(),
		Room:   "lobby",
		Server: true,
	})

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
