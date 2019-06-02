/*
	Sent when the user clicks on the "Join" button in the lobby
	"data" example:
	{
		gameID: 15103,
	}
*/

package main

import (
	"strconv"

	"github.com/Zamiell/hanabi-live/src/models"
)

func commandGameJoin(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the game exists
	gameID := d.ID
	var g *Game
	if v, ok := games[gameID]; !ok {
		s.Warning("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that the player is not already joined to this table
	i := g.GetPlayerIndex(s.UserID())
	if i != -1 {
		s.Warning("You have already joined this game.")
		return
	}

	// Validate that the player is not joined to another game
	if g2 := s.GetJoinedGame(); g2 != nil {
		s.Warning("You cannot join more than one game at a time. " +
			"Terminate your old game before joining a new one.")
		return
	}

	// Validate that this table does not already have 6 players
	if len(g.Players) >= 6 {
		s.Warning("That game already has 6 players.")
		return
	}

	// Validate that the game is not started yet
	if g.Running {
		s.Warning("That game has already started, so you cannot join it.")
		return
	}

	// Validate that they entered the correct password
	if g.Password != "" && d.Password != g.Password {
		s.Warning("That is not the correct password for this game.")
		return
	}

	/*
		Join
	*/

	log.Info(
		g.GetName() +
			"User \"" + s.Username() + "\" joined. " +
			"(There are now " + strconv.Itoa(len(g.Players)+1) + " players.)",
	)

	// Get the stats for this player
	var stats models.Stats
	if v, err := db.UserStats.Get(s.UserID(), variants[g.Options.Variant].ID); err != nil {
		log.Error("Failed to get the stats for player \""+s.Username()+"\":", err)
		s.Error("Something went wrong when getting your stats. Please contact an administrator.")
		return
	} else {
		stats = v
	}

	p := &Player{
		ID:   s.UserID(),
		Name: s.Username(),
		// We set the index in the "commandGameStart()" function
		Session: s,
		Present: true,
		Stats:   stats,
		// Time will get initialized below
		// Notes will get initialized after the deck is created in "commandGameStart.go"
		CharacterMetadata:  -1,
		CharacterMetadata2: -1,
	}
	p.InitTime(g)
	g.Players = append(g.Players, p)
	notifyAllTable(g)
	g.NotifyPlayerChange()

	// Set their status
	s.Set("currentGame", gameID)
	s.Set("status", statusPregame)
	notifyAllUser(s)

	// Send them a "joined" message
	// (to let them know they successfully joined the table)
	type JoinedMessage struct {
		GameID int `json:"gameID"`
	}
	s.Emit("joined", &JoinedMessage{
		GameID: gameID,
	})

	// Send them the chat history for this game
	chatSendPastFromGame(s, g)

	// Send the table owner whether or not the "Start Game" button should be grayed out
	g.NotifyTableReady()

	// If the user previously requested it, automatically start the game
	if g.AutomaticStart == len(g.Players) {
		// Check to see if the owner is present
		for _, p := range g.Players {
			if p.ID == g.Owner {
				if !p.Present {
					chatServerPregameSend("Aborting automatic game start since "+
						"the table creator is away.", g.ID)
					return
				}

				commandGameStart(p.Session, nil)
				return
			}
		}

		log.Error("Failed to find the owner of the game when attempting to automatically start it.")
	}
}
