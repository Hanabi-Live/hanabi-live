package main

import (
	melody "gopkg.in/olahol/melody.v1"
)

func websocketDisconnect(ms *melody.Session) {
	// Lock the command mutex for the duration of the function to ensure synchronous execution
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Turn the Melody session into a custom session
	s := &Session{ms}

	// Eject this player from any games that have not started yet
	for _, game := range games {
		if game.Running {
			continue
		}

		for _, p := range game.Players {
			if p.Name == s.Username() {
				commandGameLeave(s, nil)
			}
		}
	}

	// Delete the connection from the session map
	delete(sessions, s.UserID())

	// Log the disconnection
	log.Info("User \""+s.Username()+"\" disconnected;", len(sessions), "user(s) now connected.")
}
