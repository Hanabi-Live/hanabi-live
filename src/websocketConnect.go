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

		// The connection is now closed, but the disconnect event will be fired in another goroutine
		// Thus, we need to manually call the function now to ensure that the user is removed from existing games and so forth
		websocketDisconnect2(s2)
	}

	// Add the connection to a session map so that we can keep track of all of the connections
	sessions[s.UserID()] = s
	log.Info("User \""+s.Username()+"\" connected;", len(sessions), "user(s) now connected.")

	// Get their total number of games played
	var totalGames int
	if v, err := db.Games.GetUserNumGames(s.UserID()); err != nil {
		log.Error("Failed to get the number of games played for user \""+s.Username()+"\":", err)
		return
	} else {
		totalGames = v
	}

	// They have successfully logged in, so send initial messages to the client
	type HelloMessage struct {
		Username   string `json:"username"`
		TotalGames int    `json:"totalGames"`
	}
	s.Emit("hello", &HelloMessage{
		// We have to send the username back to the client because they may
		// have logged in with the wrong case, and the client needs to know
		// their exact username or various bugs will creep up
		Username: s.Username(),

		// We also send the total amount of games that they have played
		// (to be shown in the nav bar on the history page)
		TotalGames: totalGames,
	})

	// Send them a random name
	commandGetName(s, nil)

	// Send the past 50 chat messages from the lobby
	chatSendPastFromDatabase(s, "lobby", 50)

	// Send them the message(s) of the day
	msg := "Find teammates and discuss strategy in the "
	msg += "<a href=\"https://discord.gg/FADvkJp\" target=\"_blank\" rel=\"noopener noreferrer\">"
	msg += "Hanabi Discord chat</a>."
	s.NotifyChat(msg, "", false, true, time.Now(), "lobby")

	// Alert everyone that a new user has logged in
	// (note that we send users a message about themselves)
	notifyAllUser(s)

	// Send a "user" message for every currently connected user
	for _, s2 := range sessions {
		// Skip sending a message about ourselves since we already sent that
		if s2.UserID() == s.UserID() {
			continue
		}

		s.NotifyUser(s2)
	}

	// Send the user's game history
	// (only the last 10 games to prevent wasted bandwidth)
	var history []*models.GameHistory
	if v, err := db.Games.GetUserHistory(s.UserID(), 0, 10, false); err != nil {
		log.Error("Failed to get the history for user \""+s.Username()+"\":", err)
		return
	} else {
		history = v
	}
	history = historyFillVariants(history)
	s.NotifyGameHistory(history, false)

	// Send a "table" message for every current table
	for _, g := range games {
		s.NotifyTable(g)
	}

	// First, check to see if this user was in any existing games
	for _, g := range games {
		if g.SharedReplay {
			continue
		}

		for _, p := range g.Players {
			if p.Name != s.Username() {
				continue
			}

			// Update the player object with the new socket
			p.Session = s

			// Add the player back to the game
			log.Info(g.GetName() + "Automatically reattending player \"" + s.Username() + "\".")
			d := &CommandData{
				ID: g.ID,
			}
			commandGameReattend(s, d) // This function doesn't care what their current game and/or status is

			// If the user happens to be in more than one game, then we will just put them into the first one and ignore the rest
			return
		}
	}

	// Second, check to see if this user was in any existing shared replays
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
				commandGameSpectate(s, d) // This function doesn't care what their current game and/or status is

				// We can return here because the player can only be in one shared replay at a time
				return
			}
		}
	}
}
