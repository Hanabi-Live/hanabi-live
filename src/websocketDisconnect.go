package main

import (
	melody "gopkg.in/olahol/melody.v1"
)

func websocketDisconnect(s *melody.Session) {
	// Local variables
	d := &IncomingWebsocketData{}
	d.Command = "websocketHandleDisconnect"
	if !websocketGetSessionValues(s, d) {
		log.Error("Did not complete the \"" + d.Command + "\" function. There is now likely orphaned entries in various data structures.")
		return
	}
	username := d.v.Username

	// Lock the command mutex for the duration of the function to ensure synchronous execution
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Eject this player from any games that have not started yet
	for _, game := range games {
		if game.Running {
			continue
		}

		for _, player := range game.Players {
			if player.Username == username {
				websocketGameLeave(s, d)
			}
		}
	}

	// Leave all the chat rooms that this person is in
	// (we want this part after the race ejection because that step involves leaving rooms)
	// (at this point the user should only be in the lobby, but iterate through all of the chat rooms to make sure)
	for room, users := range chatRooms {
		for _, user := range users {
			if user.Name == username {
				d.Room = room
				roomLeave(s, d)
				break
			}
		}
	}

	// Delete the connection from the session map
	delete(websocketSessions, username)

	// Log the disconnection
	log.Info("User \""+username+"\" disconnected;", len(websocketSessions), "user(s) now connected.")
}
