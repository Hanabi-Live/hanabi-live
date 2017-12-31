package main

import (
	"github.com/Zamiell/hanabi-live/src/models"
	melody "gopkg.in/olahol/melody.v1"
)

func websocketConnect(ms *melody.Session) {
	/*
		Establish the WebSocket session
	*/

	// Lock the command mutex for the duration of the function to ensure synchronous execution
	commandMutex.Lock()
	defer commandMutex.Unlock()

	// Turn the Melody session into a custom session
	s := &Session{ms}

	// Disconnect any existing connections with this username
	if s2, ok := sessions[s.UserID()]; ok {
		log.Info("Closing existing connection for user \"" + s.Username() + "\".")
		s2.Error("You have logged on from somewhere else, so you have been disconnected here.")
		if err := s.Close(); err != nil {
			log.Error("Attempted to manually close a WebSocket connection, but it failed.")
		} else {
			log.Info("Successfully terminated a WebSocket connection.")
		}

		// Wait until the existing connection is terminated
		commandMutex.Unlock()
		for {
			commandMutex.Lock()
			_, ok := sessions[s.UserID()]
			commandMutex.Unlock()
			if !ok {
				break
			}
		}
		commandMutex.Lock()
	}

	// Add the connection to a session map so that we can keep track of all of the connections
	sessions[s.UserID()] = s
	log.Info("User \""+s.Username()+"\" connected;", len(sessions), "user(s) now connected.")

	// They have successfully logged in, so send initial messages to the client
	type HelloMessage struct {
		Username string `json:"username"`
	}
	s.Emit("hello", &HelloMessage{
		// We have to send the username back to the client because they may
		// have logged in with the wrong case, and the client needs to know
		// their exact username or various bugs will creep up
		Username: s.Username(),
	})

	// Send them a random name
	commandGetName(s, nil)

	// Send past chat messages
	// TODO

	// Send them the message(s) of the day
	msg := "Find teammates and discuss strategy in the <a href=\"https://discord.gg/JzbhWQb\">Hanabi Discord chat</a>."
	s.NotifyChat(msg, "", false, true)

	// Alert everyone that a new user has logged in
	// (note that Keldon sends users a message about themselves)
	notifyAllUser(s)

	// Send a "user" message for every currently connected user
	for _, s2 := range sessions {
		// Skip sending a message about ourselves since we already sent that
		if s2.UserID() == s.UserID() {
			continue
		}

		s.NotifyUser(s2)
	}

	// Send a "table" message for every current table
	for _, g := range games {
		s.NotifyTable(g)
	}

	// Send the user's game history
	var history []models.GameHistory
	if v, err := db.Games.GetUserHistory(s.UserID()); err != nil {
		log.Error("Failed to get the history for user \""+s.Username()+"\":", err)
		return
	} else {
		history = v
	}
	for _, h := range history {
		s.NotifyGameHistory(h)
	}

	// Check to see if this user was in any existing games
	for _, g := range games {
		for _, p := range g.Players {
			if p.Name == s.Username() {
				// Update the player object with the new socket
				p.Session = s

				// This was initialized to -1 earlier, so we need to update it
				s.Set("currentGame", g.ID)

				// We can break here because the player can only be in one game at a time
				break
			}
		}
	}
}
