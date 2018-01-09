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
	for _, g := range games {
		if g.Running {
			continue
		}

		for _, p := range g.Players {
			if p.ID == s.UserID() {
				log.Info(g.GetName() + "Ejecting user \"" + s.Username() + "\" from an unstarted game since they are re-logging in.")
				commandGameLeave(s, nil)
			}
		}
	}

	// Eject this player from any shared replays
	for _, g := range games {
		if !g.SharedReplay {
			continue
		}

		if _, ok := g.Spectators[s.UserID()]; ok {
			log.Info(g.GetName() + "Ejecting user \"" + s.Username() + "\" from a shared replay since they are re-logging in.")
			g.DisconSpectators[s.UserID()] = true
			commandGameUnattend(s, nil)
		}
	}

	// Delete the connection from the session map
	delete(sessions, s.UserID())

	// Log the disconnection
	log.Info("User \""+s.Username()+"\" disconnected;", len(sessions), "user(s) now connected.")
}
