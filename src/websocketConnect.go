/*
	This is part 2 of logging in. The user must already have performed a POST to "/login"
	and received a cookie before getting here. (The logic for that is contained in the
	"httpLogin.go" file.)
*/

package main

import (
	"time"

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
		if err := s2.Close(); err != nil {
			log.Error("Attempted to manually close a WebSocket connection, but it failed.")
		} else {
			log.Info("Successfully terminated a WebSocket connection.")
		}
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
	var rawMsgs []models.ChatMessage
	if v, err := db.ChatLog.Get("lobby", 50); err != nil {
		log.Error("Failed to get the lobby chat history for user \""+s.Username()+"\":", err)
		return
	} else {
		rawMsgs = v
	}

	msgs := make([]*ChatMessage, 0)
	for _, rawMsg := range rawMsgs {
		discord := false
		server := false
		if rawMsg.Name == "__server" {
			server = true
		}
		if rawMsg.DiscordName.Valid {
			server = false
			discord = true
			rawMsg.Name = rawMsg.DiscordName.String
		}
		msg := chatMakeMessage(rawMsg.Message, rawMsg.Name, discord, server, rawMsg.Datetime)
		msgs = append(msgs, msg)
	}
	s.Emit("chatList", msgs)

	// Send them the message(s) of the day
	msg := "Find teammates and discuss strategy in the <a href=\"https://discord.gg/FADvkJp\" target=\"_blank\" rel=\"noopener noreferrer\">Hanabi Discord chat</a>."
	s.NotifyChat(msg, "", false, true, time.Now())

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
	// (only the last 10 games to prevent on wasted bandwidth)
	var history []models.GameHistory
	if v, err := db.Games.GetUserHistory(s.UserID(), 0, 10, false); err != nil {
		log.Error("Failed to get the history for user \""+s.Username()+"\":", err)
		return
	} else {
		history = v
	}
	s.NotifyGameHistory(history)

	// Check to see if this user was in any existing games
	for _, g := range games {
		for _, p := range g.Players {
			if p.Name == s.Username() {
				// Update the player object with the new socket
				p.Session = s

				// This was initialized to -1 earlier, so we need to update it
				// (it is not updated in the "commandGameReattend()" function)
				s.Set("currentGame", g.ID)

				// Add the player back to the game
				log.Info(g.GetName() + "Automatically reattending player \"" + s.Username() + "\".")
				d := &CommandData{
					ID: g.ID,
				}
				commandGameReattend(s, d)

				// We can break here because the player can only be in one game at a time
				break
			}
		}
	}

	// Check to see if this user was in any existing shared replays
	for _, g := range games {
		if !g.SharedReplay {
			continue
		}

		for id := range g.DisconSpectators {
			if id == s.UserID() {
				delete(g.DisconSpectators, s.UserID())

				// Add the player back to the shared replay
				log.Info(g.GetName() + "Automatically respectating player \"" + s.Username() + "\".")
				d := &CommandData{
					ID: g.ID,
				}
				commandGameSpectate(s, d)

				// We can break here because the player can only be in one game at a time
				break
			}
		}
	}
}
