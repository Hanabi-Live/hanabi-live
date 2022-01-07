package main

import (
	"context"
	"runtime"

	"github.com/Hanabi-Live/hanabi-live/logger"
)

// We want to record all of the ongoing games to a flat file on the disk
// This allows the server to restart without waiting for ongoing games to finish
func gracefulRestart(ctx context.Context) {
	logger.Info("Initiating a server graceful restart.")

	// We build the client and the server first before kicking everyone off in order to reduce the
	// total amount of downtime (but executing Bash scripts will not work on Windows)
	if runtime.GOOS != "windows" {
		logger.Info("Building the client...")
		if err := executeScript("client/build_client.sh"); err != nil {
			logger.Error("Failed to execute the \"build_client.sh\" script: " + err.Error())
			return
		}

		logger.Info("Building the server...")
		if err := executeScript("server/build_server.sh"); err != nil {
			logger.Error("Failed to execute the \"build_server.sh\" script: " + err.Error())
			return
		}
	}

	waitForAllWebSocketCommandsToFinish()

	logger.Info("Serializing the tables and writing all tables to disk...")
	if !serializeTables() {
		return
	}
	logger.Info("Finished writing all tables to disk.")

	sessionList := sessions.GetList()
	for _, s := range sessionList {
		// The sound has to be before the error, since the latter will cause a disconnect
		s.NotifySoundLobby("shutdown")
		s.Error("The server is going down momentarily to load a new version of the code.<br />" +
			"If you are currently playing a game, all of the progress should be saved.<br />" +
			"Please wait a few seconds and then refresh the page.")
	}

	msg := "The server went down for a restart at: " + getCurrentTimestamp() + " " +
		"(" + gitCommitOnStart + ") - "
	uptime, _ := getUptime()
	msg += uptime
	sendMessageToWebDevChannel = true
	chatServerSend(ctx, msg, "lobby", false)

	if runtime.GOOS == "windows" {
		logger.Info("Manually kill the server now.")
	} else {
		logger.Info("Restarting...")
		if err := executeScript("restart_service_only.sh"); err != nil {
			logger.Error("Failed to execute the \"restart_service_only.sh\" script: " + err.Error())
			return
		}
	}
}
