package main

import (
	"context"
	"fmt"
	"runtime"
)

// We want to record all of the ongoing games to a flat file on the disk
// This allows the server to restart without waiting for ongoing games to finish
func gracefulRestart(ctx context.Context) {
	hLog.Info("Initiating a server graceful restart.")

	// We build the client and the server first before kicking everyone off in order to reduce the
	// total amount of downtime (but executing Bash scripts will not work on Windows)
	if runtime.GOOS != "windows" {
		hLog.Info("Building the client...")
		if err := executeScript("client/build_client.sh"); err != nil {
			hLog.Errorf("Failed to execute the \"build_client.sh\" script: %v", err)
			return
		}

		hLog.Info("Building the server...")
		if err := executeScript("server/build_server.sh"); err != nil {
			hLog.Errorf("Failed to execute the \"build_server.sh\" script: %v", err)
			return
		}
	}

	waitForAllWebSocketCommandsToFinish()

	hLog.Info("Serializing the tables and writing all tables to disk...")
	if !serializeTables() {
		return
	}
	hLog.Info("Finished writing all tables to disk.")

	sessionList := sessions2.GetList()
	for _, s := range sessionList {
		// The sound has to be before the error, since the latter will cause a disconnect
		s.NotifySoundLobby("shutdown")
		msg := "The server is going down momentarily to load a new version of the code.<br />" +
			"If you are currently playing a game, all of the progress should be saved.<br />" +
			"Please wait a few seconds and then refresh the page."
		s.Error(msg)
	}

	msg := fmt.Sprintf(
		"The server went down for a restart at: %v (%v)",
		getCurrentTimestamp(),
		gitCommitOnStart,
	)
	chatServerSend(ctx, msg, "lobby", false)

	if runtime.GOOS == "windows" {
		hLog.Info("Manually kill the server now.")
	} else {
		hLog.Info("Restarting...")
		if err := executeScript("restart_service_only.sh"); err != nil {
			hLog.Errorf("Failed to execute the \"restart_service_only.sh\" script: %v", err)
			return
		}
	}
}
