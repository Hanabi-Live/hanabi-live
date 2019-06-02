/*
	Sent when the user is in a shared replay of a speedrun game
	and wants to start a new game with the same settings as the current game
	"data" is empty
*/

package main

import (
	"strconv"
)

func commandGameRestart(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the game exists
	gameID := s.CurrentGame()
	var g *Game
	if v, ok := games[gameID]; !ok {
		s.Warning("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that this is a shared replay
	if !g.Replay || !g.Visible {
		s.Warning("Game " + strconv.Itoa(gameID) + " is not a shared replay, so you cannot send a restart action.")
		return
	}

	// Validate that this person is leading the shared replay
	if s.UserID() != g.Owner {
		s.Warning("You cannot restart a game unless you are the leader.")
		return
	}

	// Validate that there are at least two people in the shared replay
	if len(g.Spectators) < 2 {
		s.Warning("You cannot restart a game unless there are at least two people in it.")
		return
	}

	// Validate that all of the players who played the game are currently spectating
	// the shared replay
	playerSessions := make([]*Session, 0)
	spectatorSessions := make([]*Session, 0)
	for _, sp := range g.Spectators {
		playedInOriginalGame := false
		for _, p := range g.Players {
			if p.Name == sp.Name {
				playedInOriginalGame = true
				break
			}
		}
		if playedInOriginalGame {
			playerSessions = append(playerSessions, sp.Session)
		} else {
			spectatorSessions = append(spectatorSessions, sp.Session)
		}
	}
	if len(playerSessions) != len(g.Players) {
		s.Warning("Not all of the players from the original game are in the shared replay, " +
			"so you cannot restart the game.")
		return
	}

	/*
		Restart
	*/

	// Force the client of all of the spectators to go back to the lobby
	g.NotifyBoot()

	// On the server side, all of the spectators will still be in the game,
	// so manually disconnect everybody
	for _, s2 := range playerSessions {
		commandGameUnattend(s2, nil)
	}
	for _, s2 := range spectatorSessions {
		commandGameUnattend(s2, nil)
	}

	// The shared replay should now be deleted, since all of the players have left
	// Now, emulate the game owner creating a new game
	commandGameCreate(s, &CommandData{
		Name:                 getName(), // Generate a random name for the new game
		Variant:              g.Options.Variant,
		Timed:                g.Options.Timed,
		BaseTime:             g.Options.BaseTime,
		TimePerTurn:          g.Options.TimePerTurn,
		Speedrun:             g.Options.Speedrun,
		DeckPlays:            g.Options.DeckPlays,
		EmptyClues:           g.Options.EmptyClues,
		CharacterAssignments: g.Options.CharacterAssignments,
	})

	// We increment the newGameID after creating a game,
	// so assume that the ID of the last game created is equal to the "newGameID" minus 1
	ID := newGameID - 1
	g2 := games[ID]

	// Copy over the chat from the previous game, if any
	g2.Chat = g.Chat
	for k, v := range g.ChatRead {
		g2.ChatRead[k] = v
	}

	// Emulate the other players joining the game
	for _, s2 := range playerSessions {
		if s2.UserID() == s.UserID() {
			// The creator of the game does not need to join
			continue
		}
		commandGameJoin(s2, &CommandData{
			ID: ID,
		})
	}

	// Emulate the game owner clicking on the "Start Game" button
	commandGameStart(s, nil)

	// Automatically join any other spectators that were watching
	for _, s2 := range spectatorSessions {
		commandGameSpectate(s2, &CommandData{
			ID: ID,
		})
	}
}
