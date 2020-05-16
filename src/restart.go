package main

import (
	"encoding/json"
	"io/ioutil"
	"path"
	"runtime"
	"strconv"
)

// We want to record all of the ongoing games to a flat file on the disk
// This allows the server to restart without waiting for ongoing games to finish
func restart() {
	// We build the client first before kicking everyone off in order to
	// reduce the total amount of downtime
	// (but executing Bash scripts will not work on Windows)
	if runtime.GOOS != "windows" {
		logger.Info("Building the client...")
		execute("build_client.sh", projectPath)
	}

	// Lock the command mutex to prevent any more moves from being submitted
	commandMutex.Lock()
	defer commandMutex.Unlock()

	logger.Info("Serializing the tables...")
	if !serializeTables() {
		return
	}

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

	logger.Info("Finished writing all tables to disk. Restarting...")
	execute("restart.sh", projectPath)

	// Block until the process is killed so that no more moves can be submitted
	select {}
}

func serializeTables() bool {
	for _, t := range tables {
		logger.Info("Serializing table:", t.ID)

		// Only serialize ongoing games
		if !t.Running || t.Replay {
			logger.Info("Skipping due to it being unstarted or a replay.")
			continue
		}

		// Force all of the spectators to leave, if any
		for _, sp := range t.Spectators {
			s := sp.Session
			if s == nil {
				// A spectator's session should never be nil
				// They might be in the process of reconnecting,
				// so make a fake session that will represent them
				s = newFakeSession(sp.ID, sp.Name)
				logger.Info("Created a new fake session in the \"serializeTables()\" function.")
			} else {
				// Boot them from the game
				s.Emit("boot", nil)
			}
			commandTableUnattend(s, &CommandData{
				TableID: t.ID,
			})
		}
		if len(t.Spectators) > 0 {
			logger.Error("The size of the spectators slice is " + strconv.Itoa(len(t.Spectators)) +
				", even after booting all of the spectators. Manually emptying the slice.")
			t.Spectators = make([]*Spectator, 0)
		}

		// Set all the player sessions to nil, since it is not necessary to serialize those
		for _, p := range t.Players {
			p.Session = nil
			p.Present = false
		}

		// "t.Game.Table" and "t.Game.Options" are circular references;
		// we do not have to unset them because we have specified `json:"-"` on their fields,
		// so the JSON encoder will ignore them

		var tableJSON []byte
		if v, err := json.Marshal(t); err != nil {
			logger.Error("Failed to marshal table "+strconv.Itoa(t.ID)+":", err)
			return false
		} else {
			tableJSON = v
		}

		tablePath := path.Join(tablesPath, strconv.Itoa(t.ID)+".json")
		if err := ioutil.WriteFile(tablePath, tableJSON, 0600); err != nil {
			logger.Error("Failed to write the table "+strconv.Itoa(t.ID)+" to "+
				"\""+tablePath+"\":", err)
			return false
		}
	}

	return true
}
