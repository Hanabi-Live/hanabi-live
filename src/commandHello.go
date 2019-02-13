/*
	Sent when the user:
	- is in a game that is starting
	- joins a game that has already started
	- starts a replay
	- starts spectating a game

	This is sent before the UI is initialized; the client will send a "ready"
	message later to get more data

	"data" is empty
*/

package main

import (
	"strconv"

	"github.com/Zamiell/hanabi-live/src/models"
)

func commandHello(s *Session, d *CommandData) {
	gameID := s.CurrentGame()
	var g *Game
	if s.Status() == statusReplay || s.Status() == statusSharedReplay {
		var variantID int
		if v, err := db.Games.GetVariant(gameID); err != nil {
			log.Error("Failed to get the variant from the database for game "+strconv.Itoa(gameID)+":", err)
			s.Error("Failed to initialize the game. Please contact an administrator.")
			return
		} else {
			variantID = v
		}

		var characterAssignmentsEnabled bool
		if v, err := db.Games.GetCharacterAssignments(gameID); err != nil {
			log.Error("Failed to get the character assignments from the database for game "+strconv.Itoa(gameID)+":", err)
			s.Error("Failed to initialize the game. Please contact an administrator.")
			return
		} else {
			characterAssignmentsEnabled = v
		}

		var dbPlayers []*models.Player
		if v, err := db.Games.GetPlayers(gameID); err != nil {
			log.Error("Failed to get the players from the database for game "+strconv.Itoa(gameID)+":", err)
			s.Error("Failed to initialize the game. Please contact an administrator.")
			return
		} else {
			dbPlayers = v
		}

		// We need to convert the database player objects to a normal player objects
		var players []*Player
		for _, p := range dbPlayers {
			player := &Player{
				ID:                p.ID,
				Name:              p.Name,
				Character:         charactersID[p.CharacterAssignment],
				CharacterMetadata: p.CharacterMetadata,
			}
			players = append(players, player)
		}

		g = &Game{
			Options: &Options{
				Variant:              variantsID[variantID],
				CharacterAssignments: characterAssignmentsEnabled,
			},
			Players: players,
		}
	} else {
		// Validate that the game exists
		if v, ok := games[gameID]; !ok {
			s.Error("Game " + strconv.Itoa(gameID) + " does not exist.")
			return
		} else {
			g = v
		}
	}

	// Create a list of names of the users in this game
	names := make([]string, 0)
	for _, p := range g.Players {
		names = append(names, p.Name)
	}

	// Create a list of the "Detrimental Character Assignments", if enabled
	characterAssignments := make([]string, 0)
	characterMetadata := make([]int, 0)
	if g.Options.CharacterAssignments {
		for _, p := range g.Players {
			characterAssignments = append(characterAssignments, p.Character)
			characterMetadata = append(characterMetadata, p.CharacterMetadata)
		}
	}

	// Find out what seat number (index) this user is sitting in
	seat := 0 // By default, assume a seat of 0
	for i, p := range g.Players {
		if p.ID == s.UserID() {
			seat = i
			break
		}
	}
	// If this is a replay of a game they were not in (or if they are spectating),
	// the above if statement will never be reached, and they will be in seat 0

	// Give them an "init" message
	type InitMessage struct {
		// Game settings
		Names        []string `json:"names"`
		Variant      string   `json:"variant"`
		Seat         int      `json:"seat"`
		Spectating   bool     `json:"spectating"`
		Replay       bool     `json:"replay"`
		SharedReplay bool     `json:"sharedReplay"`

		// Optional settings
		Timed                bool     `json:"timed"`
		BaseTime             int      `json:"baseTime"`
		TimePerTurn          int      `json:"timePerTurn"`
		Speedrun             bool     `json:"speedrun"`
		DeckPlays            bool     `json:"deckPlays"`
		EmptyClues           bool     `json:"emptyClues"`
		CharacterAssignments []string `json:"characterAssignments"`
		CharacterMetadata    []int    `json:"characterMetadata"`
	}
	s.Emit("init", &InitMessage{
		// Game settings
		Names:        names,
		Variant:      g.Options.Variant,
		Seat:         seat,
		Spectating:   s.Status() == statusSpectating,
		Replay:       s.Status() == statusReplay || s.Status() == statusSharedReplay,
		SharedReplay: s.Status() == statusSharedReplay,

		// Optional settings
		Timed:                g.Options.Timed,
		BaseTime:             g.Options.BaseTime,
		TimePerTurn:          g.Options.TimePerTurn,
		Speedrun:             g.Options.Speedrun,
		DeckPlays:            g.Options.DeckPlays,
		EmptyClues:           g.Options.EmptyClues,
		CharacterAssignments: characterAssignments,
		CharacterMetadata:    characterMetadata,
	})
}
