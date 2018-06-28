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

	// Look for the disconnecting player in all the games
	for _, g := range games {
		// They could be one of the players (1/2)
		for _, p := range g.Players {
			if p.ID == s.UserID() {
				if g.Running {
					log.Info(g.GetName() + "Unattending player \"" + s.Username() + "\" since they disconnected.")
					commandGameUnattend(s, nil)
				} else {
					log.Info(g.GetName() + "Ejecting player \"" + s.Username() + "\" from an unstarted game since they disconnected.")
					commandGameLeave(s, nil)
				}
			}
		}

		// They could be one of the spectators (2/2)
		if _, ok := g.Spectators[s.UserID()]; ok {
			log.Info(g.GetName() + "Ejecting spectator \"" + s.Username() + "\" since they disconnected.")
			g.DisconSpectators[s.UserID()] = true
			commandGameUnattend(s, nil)
		}
	}

	// Delete the connection from the session map
	delete(sessions, s.UserID())

	// Log the disconnection
	log.Info("User \""+s.Username()+"\" disconnected;", len(sessions), "user(s) now connected.")
}
