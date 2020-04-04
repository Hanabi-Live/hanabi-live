/*
	Sent when the owner of a table clicks on the "Start Game" button
	(the client will send a "hello" message after getting "tableStart")

	"data" is empty
*/

package main

import (
	"math/rand"
	"strconv"
	"time"
)

func commandTableStart(s *Session, d *CommandData) {
	/*
		Validation
	*/

	// Validate that the table exists
	tableID := s.CurrentTable()
	var t *Table
	if v, ok := tables[tableID]; !ok {
		s.Warning("Table " + strconv.Itoa(tableID) + " does not exist.")
		return
	} else {
		t = v
	}

	// Validate that this is the owner of the table
	if s.UserID() != t.Owner {
		s.Warning("Only the owner of a table can start the game.")
		return
	}

	// Validate that the table has at least 2 players
	if len(t.Players) < 2 {
		s.Warning("You need at least 2 players before you can start a game.")
		return
	}

	// Validate that the game is not started yet
	if t.Running {
		s.Warning("The game has already started, so you cannot start it.")
		return
	}

	// Validate extra things for "!replay" games
	if t.Options.SetReplay != 0 {
		// Validate that the right amount of players is in the game
		if numPlayers, err := models.Games.GetNumPlayers(t.Options.SetReplay); err != nil {
			logger.Error("Failed to get the number of players in game "+
				strconv.Itoa(t.Options.SetReplay)+":", err)
			s.Error("Failed to create the game. Please contact an administrator.")
			return
		} else if len(t.Players) != numPlayers {
			s.Warning("You currently have " + strconv.Itoa(len(t.Players)) + " players but game " +
				strconv.Itoa(t.Options.SetReplay) + " needs " + strconv.Itoa(numPlayers) +
				" players.")
			return
		}

		// Validate that everyone is present
		// (this only applies to "!replay" because
		// we need to emulate player actions using their session)
		for _, p := range t.Players {
			if !p.Present {
				s.Warning("Everyone must be present before you can start this game.")
				return
			}
		}
	}

	/*
		Start
	*/

	logger.Info(t.GetName() + "Starting the game.")

	// Create the game object
	g := NewGame(t)

	// Start the idle timeout
	go t.CheckIdle()

	g.InitDeck()

	// Handle setting the seed
	shuffleDeck := true
	shufflePlayers := true
	seedPrefix := "p" + strconv.Itoa(len(t.Players)) + // e.g. p2v0s
		"v" + strconv.Itoa(variants[t.Options.Variant].ID) + "s"
	if t.Options.SetSeed != "" {
		// This is a replay of a game from the database
		g.Seed = t.Options.SetSeed
		shufflePlayers = false
	} else if t.Options.SetSeedSuffix != "" {
		// This is a custom game created with the "!seed" prefix
		// (e.g. playing a deal with a specific seed)
		g.Seed = seedPrefix + t.Options.SetSeedSuffix
	} else if t.Options.SetReplay != 0 {
		// This is a custom game created with the "!replay" prefix
		// (e.g. a replay of an existing game in the database)
		if v, err := models.Games.GetSeed(t.Options.SetReplay); err != nil {
			logger.Error("Failed to get the seed for game "+
				"\""+strconv.Itoa(t.Options.SetReplay)+"\":", err)
			s.Error("Failed to create the game. Please contact an administrator.")
			return
		} else {
			g.Seed = v
		}
	} else if t.Options.CustomDeck != nil {
		// This is a game with a custom (preset) deck, so just set the seed to 0
		g.Seed = "0"
		shuffleDeck = false
		shufflePlayers = false
	} else {
		// This is a normal game with a random seed / a random deck
		// Get a list of all the seeds that these players have played before
		seedMap := make(map[string]bool)
		for _, p := range t.Players {
			var seeds []string
			if v, err := models.Games.GetPlayerSeeds(p.ID); err != nil {
				logger.Error("Failed to get the past seeds for \""+s.Username()+"\":", err)
				s.Error("Failed to create the game. Please contact an administrator.")
				return
			} else {
				seeds = v
			}

			for _, v := range seeds {
				seedMap[v] = true
			}
		}

		// Find a seed that no-one has played before
		seedNum := 0
		looking := true
		for looking {
			seedNum++
			g.Seed = seedPrefix + strconv.Itoa(seedNum)
			if !seedMap[g.Seed] {
				looking = false
			}
		}
	}
	logger.Info(t.GetName()+"Using seed:", g.Seed)

	g.InitSeed() // Seed the random number generator
	if shuffleDeck {
		g.ShuffleDeck()
	}

	// Mark the order of all of the cards in the deck
	for i, c := range g.Deck {
		c.Order = i
	}

	/*
		// Log the deal (so that it can be distributed to others if necessary)
		logger.Info("--------------------------------------------------")
		logger.Info("Deal for seed: " + g.Seed + " (from top to bottom)")
		logger.Info("(cards are dealt to a player until their hand fills up before " +
			"moving on to the next one)")
		for i, c := range g.Deck {
			logger.Info(strconv.Itoa(i+1) + ") " + c.Name(g))
		}
		logger.Info("--------------------------------------------------")
	*/

	// The 0th player will always go first
	// Since we want a random player to start first, we need to shuffle the order of the players
	// Additionally, we need to shuffle the order of the players so that the order that the players
	// joined the game in does not correspond to the order of the players in the actual game
	// https://stackoverflow.com/questions/12264789/shuffle-array-in-go
	if shufflePlayers {
		for i := range t.Players {
			j := rand.Intn(i + 1)
			t.Players[i], t.Players[j] = t.Players[j], t.Players[i]
		}
	}

	// Games created prior to April 2020 do not always have the 0th player taking the first turn
	if t.Options.StartingPlayer != 0 {
		g.ActivePlayer = t.Options.StartingPlayer
	}

	// Initialize the GamePlayer objects
	for i, p := range t.Players {
		gp := &GamePlayer{
			Name:  p.Name,
			Index: i,
			Game:  g,

			Hand: make([]*Card, 0),
			// There are notes for every card in the deck + the stack bases for each suit
			Notes: make([]string, len(g.Deck)+len(variants[t.Options.Variant].Suits)),
		}
		gp.InitTime(t.Options)
		g.Players = append(g.Players, gp)
	}

	// Decide the random character assignments
	// (this has to be after seed generation and initialization)
	characterGenerate(g)

	// Initialize all of the players to not being present
	// This is so that we don't send them unnecessary messages during the game initialization
	// (we will set them back to present once they send the "ready" message)
	listOfAwayPlayers := make([]int, 0)
	for _, p := range t.Players {
		if p.Present {
			p.Present = false
		} else {
			listOfAwayPlayers = append(listOfAwayPlayers, p.ID)
		}
	}

	// Deal the cards
	handSize := g.GetHandSize()
	for _, p := range g.Players {
		for i := 0; i < handSize; i++ {
			p.DrawCard()
		}
	}

	// Record the initial status of the game
	t.NotifyStatus(false) // The argument is "doubleDiscard"

	// Show who goes first
	// (this must be sent before the "turn" message
	// so that the text appears on the first turn of the replay)
	text := g.Players[g.ActivePlayer].Name + " goes first"
	g.Actions = append(g.Actions, ActionText{
		Type: "text",
		Text: text,
	})
	logger.Info(t.GetName() + text)

	// Record a message about the first turn
	t.NotifyTurn()

	// Now that all of the initial game actions have been performed, mark that the game has started
	t.Running = true
	t.DatetimeStarted = time.Now()

	// If we are replaying an existing game up to a certain point,
	// emulate all of the actions until turn N
	if t.Options.SetReplay != 0 {
		d.Source = "id"
		if emulateActions(s, d, t) {
			return
		}

		// We have to reset all of the player's clocks to avoid some bugs relating to
		// taking super-fast turns
		for _, p := range g.Players {
			p.InitTime(t.Options)
		}
	}

	// Send a "tableStart" message to everyone in the game
	for _, p := range t.Players {
		// If a player is back in the lobby, then don't automatically force them into the game
		if !intInSlice(p.ID, listOfAwayPlayers) {
			p.Session.NotifyTableStart()
		}
	}

	// If we are emulating actions, we do not have to tell anyone about the table yet
	if !t.Options.Replay {
		// Let everyone know that the game has started, which will turn the
		// "Join Game" button into "Spectate"
		notifyAllTable(t)

		// Set the status for all of the users in the game
		for _, p := range t.Players {
			p.Session.Set("status", statusPlaying)
			notifyAllUser(p.Session)
		}
	}

	// Start the timer
	if t.Options.Timed {
		go g.CheckTimer(g.Turn, g.PauseCount, g.Players[g.ActivePlayer])
	}
}
