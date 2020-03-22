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
		logger.Info("User \"" + s.Username() + "\" disconnected, but their session was already deleted.")
		return
	} else if s2.SessionID() != s.SessionID() {
		logger.Info("The orphaned session for user \"" + s.Username() + "\" successfully disconnected.")
		return
	}

	// Delete the connection from the session map
	// (we do this first so that we don't bother sending them any more notifications)
	delete(sessions, s.UserID())

	// Look for the disconnecting player in all of the tables
	for _, t := range tables {
		// They could be one of the players (1/2)
		if !t.Replay && t.GetPlayerIndexFromID(s.UserID()) != -1 {
			if t.Running {
				logger.Info(t.GetName() + "Unattending player \"" + s.Username() + "\" " +
					"since they disconnected.")
				s.Set("currentTable", t.ID)
				s.Set("status", statusPlaying)
				commandTableUnattend(s, nil)
			} else {
				logger.Info(t.GetName() + "Ejecting player \"" + s.Username() + "\" " +
					"from an unstarted game since they disconnected.")
				s.Set("currentTable", t.ID)
				s.Set("status", statusPregame)
				commandTableLeave(s, nil)
			}
		}

		// They could be one of the spectators (2/2)
		if t.GetSpectatorIndexFromID(s.UserID()) != -1 {
			logger.Info(t.GetName() + "Ejecting spectator \"" + s.Username() + "\" " +
				"since they disconnected.")
			t.DisconSpectators[s.UserID()] = true
			s.Set("currentTable", t.ID)
			s.Set("status", statusSpectating)
			commandTableUnattend(s, nil)
		}
	}

	// Alert everyone that a user has logged out
	notifyAllUserLeft(s)

	// Log the disconnection
	logger.Info("User \""+s.Username()+"\" disconnected;", len(sessions), "user(s) now connected.")
}
