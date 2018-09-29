/*
	Sent when the user sends a text message to the lobby by pressing enter
	"data" example:
	{
		msg: 'hi',
		room: 'lobby',
		// Room can also be 'game'
	}
*/

package main

import (
	"strconv"
	"time"

	"github.com/microcosm-cc/bluemonday"
)

const (
	maxChatLength = 300
)

func commandChat(s *Session, d *CommandData) {
	// Local variables
	var userID int
	if d.Discord || d.Server {
		userID = 0
	} else {
		if s == nil {
			log.Error("Failed to send a chat message because the sender's session was nil.")
			return
		}
		userID = s.UserID()
	}
	if d.Username == "" && s != nil {
		d.Username = s.Username()
	}

	/*
		Validate
	*/

	// Validate the message
	if d.Msg == "" {
		s.Warning("You cannot send a blank message.")
		return
	}

	// Truncate long messages
	if len(d.Msg) > maxChatLength {
		d.Msg = d.Msg[0 : maxChatLength-1]
	}

	// Validate the room
	if d.Room != "lobby" && d.Room != "game" {
		s.Warning("That is not a valid room.")
		return
	}

	var g *Game
	if d.Room == "game" {
		gameID := s.CurrentGame()

		// Validate that they are in a game if they are trying to send to a game room
		if gameID == -1 {
			s.Warning("You cannot send game chat if you are not in a game.")
			return
		}

		// Get the corresponding game
		if v, ok := games[gameID]; !ok {
			s.Warning("Game " + strconv.Itoa(gameID) + " does not exist.")
			return
		} else {
			g = v
		}

		// Validate that the game is running
		if !g.Running {
			s.Warning("Game " + strconv.Itoa(gameID) + " has not started yet.")
			return
		}

		// Validate that this player is in the game or spectating
		if g.GetPlayerIndex(userID) == -1 && g.GetSpectatorIndex(userID) == -1 {
			s.Warning("You are not playing or spectating game " + strconv.Itoa(gameID) + ".")
			return
		}
	}

	// Sanitize the message using the bluemonday library to stop
	// various attacks against other players
	msg := d.Msg
	p := bluemonday.StrictPolicy()
	msg = p.Sanitize(d.Msg)

	/*
		Chat
	*/

	// Append the game ID to the room

	// Add the message to the database
	if d.Discord {
		if err := db.ChatLog.InsertDiscord(d.Username, msg, d.Room); err != nil {
			log.Error("Failed to insert a Discord chat message into the database:", err)
			s.Error("")
			return
		}
	} else {
		if err := db.ChatLog.Insert(userID, msg, d.Room); err != nil {
			log.Error("Failed to insert a chat message into the database:", err)
			s.Error("")
			return
		}
	}

	// Log the message
	text := "<" + d.Username
	if d.DiscordDiscriminator != "" {
		text += "#" + d.DiscordDiscriminator
	}
	text += "> " + msg
	log.Info(text)

	if d.Room == "game" {
		// Send it to all of the players and spectators
		if !g.SharedReplay {
			for _, p := range g.Players {
				p.Session.NotifyChat(msg, d.Username, d.Discord, d.Server, time.Now(), d.Room)
			}
		}
		for _, s2 := range g.Spectators {
			s2.NotifyChat(msg, d.Username, d.Discord, d.Server, time.Now(), d.Room)
		}

		return
	}

	// Convert Discord mentions from number to username
	msg = chatFillMentions(msg)

	// Lobby messages go to everyone
	for _, s2 := range sessions {
		s2.NotifyChat(msg, d.Username, d.Discord, d.Server, time.Now(), d.Room)
	}

	// Send the chat message to the Discord "#general" channel if we are replicating a message
	to := discordLobbyChannel
	if d.Server && !d.Echo {
		// Send server messages to a separate channel
		to = discordBotChannel
	}

	// Don't send Discord messages that we are already replicating
	if !d.Discord {
		// We use "d.Msg" instead of "msg" because we want to send the unsanitized message
		// The bluemonday library is intended for HTML rendering, and Discord can handle any special characters
		discordSend(to, d.Username, d.Msg)
	}

	// Check for commands
	chatCommand(s, d)
}
