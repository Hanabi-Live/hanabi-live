/*
	Sent when the user performs an action in a shared replay
	"data" example:
	{
		type: 0,
		// 0 is a turn change
		// 1 is a card arrow indication
		// 2 is a leader transfer
		// 3 is a "hypothetical" card morph
		// 4 is a sound effect
		value: 10,
		name: 'Zamiel',
	}
*/

package main

import "strconv"

func commandReplayAction(s *Session, d *CommandData) {
	/*
		Validate
	*/

	// Validate that the game exists
	gameID := s.CurrentGame()
	var g *Game
	if v, ok := games[gameID]; !ok {
		s.Error("Game " + strconv.Itoa(gameID) + " does not exist.")
		return
	} else {
		g = v
	}

	// Validate that this is a shared replay
	if !g.SharedReplay {
		s.Error("Game " + strconv.Itoa(gameID) + " is not a shared replay, so you cannot send a shared replay action.")
		return
	}

	// Validate that this person is leading the review
	if s.UserID() != g.Owner {
		s.Error("You cannot send a shared replay action unless you are the leader.")
		return
	}

	/*
		Replay action
	*/

	// Start the idle timeout
	go g.CheckIdle()

	// Change the current turn
	if d.Type == 0 {
		g.Turn = d.Turn
	}

	// Send the message to everyone else
	if d.Type == 0 {
		// A turn change
		for _, sp := range g.Spectators {
			type ReplayTurnMessage struct {
				Turn int `json:"turn"`
			}
			sp.Emit("replayTurn", &ReplayTurnMessage{
				Turn: d.Turn,
			})
		}
	} else if d.Type == 1 {
		// A card arrow indication
		for _, sp := range g.Spectators {
			type ReplayIndicatorMessage struct {
				Order int `json:"order"`
			}
			sp.Emit("replayIndicator", &ReplayIndicatorMessage{
				Order: d.Order,
			})
		}
	} else if d.Type == 2 {
		// A leader transfer
		// Validate that the person that they are passing off the leader to actually exists in the game
		newLeaderID := -1
		for _, sp := range g.Spectators {
			if sp.Username() == d.Name {
				newLeaderID = sp.UserID()
				break
			}
		}
		if newLeaderID == -1 {
			s.Error("That is an invalid username to pass leadership to.")
			return
		}

		// Mark them as the new replay leader
		g.Owner = newLeaderID

		// Tell everyone about the new leader
		// (which will enable the replay controls for the leader)
		for _, sp := range g.Spectators {
			sp.NotifyReplayLeader(g)
		}
	} else if d.Type == 3 {
		// A "hypothetical" card morph
		for _, sp := range g.Spectators {
			type ReplayMorphMessage struct {
				Order int `json:"order"`
				Suit  int `json:"suit"`
				Rank  int `json:"rank"`
			}
			sp.Emit("replayMorph", &ReplayMorphMessage{
				Order: d.Order,
				Suit:  d.Suit,
				Rank:  d.Rank,
			})
		}
	} else if d.Type == 4 {
		// A sound effect
		for _, sp := range g.Spectators {
			type ReplaySoundMessage struct {
				Sound string `json:"sound"`
			}
			sp.Emit("replaySound", &ReplaySoundMessage{
				Sound: d.Sound,
			})
		}
	} else {
		s.Error("That is an invalid type of shared replay action.")
		return
	}
}
