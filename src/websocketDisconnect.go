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

	// We have to do the work in a separate function so that we can call it manually in the "websocketConnect()" function
	websocketDisconnect2(s)
}

func websocketDisconnect2(s *Session) {
	// Check to see if the existing session is different
	// (this occurs during a reconnect, for example)
	if s2, ok := sessions[s.UserID()]; !ok {
		log.Info("User \"" + s.Username() + "\" disconnected, but their session was already deleted.")
		return
	} else if s2.ID() != s.ID() {
		log.Info("The orphaned session for user \"" + s.Username() + "\" successfully disconnected.")
		return
	}

	// Delete the connection from the session map
	// (we do this first so that we don't bother sending them any more notifications)
	delete(sessions, s.UserID())

	// Look for the disconnecting player in all the games
	for _, g := range games {
		// They could be one of the players (1/2)
		if !g.Replay && g.GetPlayerIndex(s.UserID()) != -1 {
			if g.Running {
				log.Info(g.GetName() + "Unattending player \"" + s.Username() + "\" since they disconnected.")
				s.Set("currentGame", g.ID)
				s.Set("status", statusPlaying)
				commandGameUnattend(s, nil)
			} else {
				log.Info(g.GetName() + "Ejecting player \"" + s.Username() + "\" from an unstarted game since they disconnected.")
				s.Set("currentGame", g.ID)
				s.Set("status", statusPregame)
				commandGameLeave(s, nil)
			}
		}

		// They could be one of the spectators (2/2)
		if g.GetSpectatorIndex(s.UserID()) != -1 {
			log.Info(g.GetName() + "Ejecting spectator \"" + s.Username() + "\" since they disconnected.")
			g.DisconSpectators[s.UserID()] = true
			s.Set("currentGame", g.ID)
			s.Set("status", statusSpectating)
			commandGameUnattend(s, nil)
		}
	}

	// Alert everyone that a user has logged out
	notifyAllUserLeft(s)

	// Log the disconnection
	log.Info("User \""+s.Username()+"\" disconnected;", len(sessions), "user(s) now connected.")
}
