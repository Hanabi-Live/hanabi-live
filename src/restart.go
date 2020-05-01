package main

import (
	"encoding/json"
	"io/ioutil"
	"path"
	"strconv"
)

// We want to record all of the ongoing games to a flat file on the disk
// This allows the server to restart without waiting for ongoing games to finish
func restart() {
	// We build the client first before kicking everyone off in order to
	// reduce the total amount of downtime
	logger.Info("Building the client...")
	execute("build_client.sh", projectPath)

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
